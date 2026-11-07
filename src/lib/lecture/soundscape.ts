import type { RoomDimensions, RoomMaterials, ResonanceAudio as ResonanceScene } from "resonance-audio";
import type { Ambience, Distance, Height, SceneAmbience, SceneLine, ScenePlace, SoundCue } from "./script";
import { soundBuffer } from "./sounds";

/**
 * Scène sonore en 3D dans les écouteurs, au plus près de ce que fait Dolby Atmos au casque :
 *
 * - Resonance Audio (Google, libre, ~38 Ko compressé, chargé seulement pour la lecture) place
 *   chaque son sur une sphère autour de la tête (devant, derrière, au-dessus, en dessous : rendu
 *   ambisonique d'ordre 3, puis « binaural » avec des oreilles mesurées) et le fait sonner dans un
 *   lieu : murs, sol, plafond et leur matière donnent les échos et la réverbération.
 * - Les bruits de fond sont « larges » (la pluie tombe tout autour, pas d'un seul point).
 * - Le son direct passe par un modèle des deux oreilles (ears) : retard entre les oreilles, ombre
 *   de la tête, aigus étouffés derrière. Mesuré dans Chrome : Resonance seul ne donnait que ~5 dB
 *   entre les oreilles pour un son sur le côté (~2 dB dans une pièce), et l'utilisateur ne sentait
 *   rien au casque. Avec les oreilles : des pas à gauche, 15 dB et 0,5 à 0,9 ms d'avance à gauche.
 * - La narratrice reste au milieu de la tête, sans écho : c'est elle qui tient le livre.
 *
 * Sans Resonance (chargement raté), le panneau 3D du navigateur (HRTF) prend le relais.
 * Toutes les attentes et tous les déplacements suivent l'horloge du son : la pause fige tout.
 */

const METERS: Record<Distance, number> = { "tout-pres": 0.7, pres: 1.6, loin: 6 };
/** Hauteur en part de la distance (haut : ~40° au-dessus, bas : ~25° en dessous). */
const LIFT: Record<Height, number> = { haut: 0.85, milieu: 0, bas: -0.45 };
/** Largeur des bruits de fond, en degrés (360 : tout autour). */
const WIDTH: Record<Ambience, number> = { vent: 160, pluie: 360, vagues: 120, riviere: 60, feu: 25, nuit: 270, oiseaux: 100, foret: 300 };
/** Niveau du son direct (les « oreilles ») et part envoyée au lieu (Resonance) pour un son précis. */
const DIRECT = 1;
const ROOM_SEND = 0.55;
/** Resonance rend plus bas que le son direct : on le remonte. */
const SCENE_GAIN = 1.3;
/** Places réservées aux bruits courts (jusqu'à 3 par réplique, qui peuvent se chevaucher). */
const CUE_SLOTS = 6;

export type Place = { side: number; distance: Distance; height?: Height };

type Room = { dimensions: RoomDimensions; materials: RoomMaterials };
const OPEN = "transparent";
const walls = (wall: string, down: string, up = wall): RoomMaterials => ({ left: wall, right: wall, front: wall, back: wall, up, down });

/** Chaque lieu : dimensions en mètres et matières (tables de Resonance). Dehors, seul le sol renvoie le son. */
export const ROOMS: Record<ScenePlace, Room> = {
  "plein-air": { dimensions: { width: 40, height: 30, depth: 40 }, materials: walls(OPEN, "grass", OPEN) },
  plage: { dimensions: { width: 50, height: 30, depth: 50 }, materials: walls(OPEN, "water-or-ice-surface", OPEN) },
  foret: { dimensions: { width: 18, height: 14, depth: 18 }, materials: walls("curtain-heavy", "grass", OPEN) },
  rue: {
    dimensions: { width: 10, height: 12, depth: 40 },
    materials: { left: "brick-bare", right: "brick-bare", front: OPEN, back: OPEN, up: OPEN, down: "polished-concrete-or-tile" },
  },
  maison: { dimensions: { width: 5, height: 2.8, depth: 6 }, materials: walls("plaster-smooth", "linoleum-on-concrete", "wood-ceiling") },
  "petite-piece": { dimensions: { width: 3, height: 2.5, depth: 3 }, materials: walls("plaster-smooth", "linoleum-on-concrete") },
  "grande-salle": { dimensions: { width: 15, height: 8, depth: 25 }, materials: walls("plaster-smooth", "marble") },
  mosquee: { dimensions: { width: 20, height: 12, depth: 20 }, materials: walls("plaster-smooth", "curtain-heavy") },
  grotte: { dimensions: { width: 9, height: 6, depth: 16 }, materials: walls("concrete-block-coarse", "water-or-ice-surface") },
  bateau: { dimensions: { width: 3, height: 2.2, depth: 8 }, materials: walls("wood-panel", "wood-panel") },
};

function point(place: Place, meters = METERS[place.distance]) {
  const r = (place.side * Math.PI) / 180;
  // Auditeur en (0,0,0), qui regarde vers -z ; la droite est +x, le haut +y.
  return { x: Math.sin(r) * meters, y: LIFT[place.height ?? "milieu"] * meters, z: -Math.cos(r) * meters };
}

type Position = Place & { meters: number };

/**
 * Les deux oreilles, comme le cerveau s'en sert pour savoir d'où vient un son :
 * - le son arrive plus tôt à l'oreille la plus proche (jusqu'à 0,66 ms quand il est sur le côté :
 *   formule de Woodworth, tête de 8,75 cm) ; c'est ce qui place les sons graves ;
 * - la tête fait de l'ombre : l'oreille opposée l'entend plus bas et étouffé (aigus coupés) ;
 * - derrière, l'oreille externe étouffe un peu les aigus des deux côtés : c'est ce qui sépare
 *   devant et derrière ; au-dessus, un peu plus d'aigus.
 * Le premier essai ne jouait que sur le volume (StereoPanner) : l'utilisateur, au casque, ne
 * sentait pas le son passer d'une oreille à l'autre.
 */
function ears(ctx: BaseAudioContext, output: AudioNode) {
  const input = new GainNode(ctx, { gain: 1 });
  const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
  merger.connect(output);
  const side = (channel: number) => {
    const delay = new DelayNode(ctx, { maxDelayTime: 0.002, delayTime: 0 });
    const shadow = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 18_000, Q: 0.5 });
    const air = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 6_000, gain: 0 });
    const gain = new GainNode(ctx, { gain: 0 });
    input.connect(delay).connect(shadow).connect(air).connect(gain).connect(merger, 0, channel);
    return { delay, shadow, air, gain };
  };
  const left = side(0);
  const right = side(1);
  const smooth = (param: AudioParam, value: number) => param.setTargetAtTime(value, ctx.currentTime, 0.015);
  return {
    input,
    set(angle: number, level: number, height: Height) {
      const r = (angle * Math.PI) / 180;
      const lateral = Math.abs(Math.sin(r));
      const front = Math.cos(r);
      const itd = 0.000255 * (Math.asin(lateral) + lateral);
      const [near, far] = Math.sin(r) >= 0 ? [right, left] : [left, right];
      const behind = Math.max(0, -front);
      const back = 18_000 * (4_500 / 18_000) ** behind;
      smooth(near.delay.delayTime, 0);
      smooth(far.delay.delayTime, itd);
      smooth(near.shadow.frequency, back);
      smooth(far.shadow.frequency, Math.min(back, 18_000 * (1_400 / 18_000) ** lateral));
      smooth(near.gain.gain, level * (1 + 0.25 * lateral));
      smooth(far.gain.gain, level * (1 - 0.8 * lateral));
      const lift = height === "haut" ? 5 : height === "bas" ? -4 : 0;
      smooth(near.air.gain, lift);
      smooth(far.air.gain, lift);
    },
  };
}

/** Entre deux places, en arc autour de la tête (plus court chemin : de 170 à -170, par derrière). */
export function between(from: Place, to: Place, x: number): Position {
  let delta = to.side - from.side;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const ease = x * x * (3 - 2 * x);
  const a = LIFT[from.height ?? "milieu"];
  const lift = a + (LIFT[to.height ?? "milieu"] - a) * ease;
  const height: Height = lift > 0.4 ? "haut" : lift < -0.2 ? "bas" : "milieu";
  const meters = METERS[from.distance] + (METERS[to.distance] - METERS[from.distance]) * ease;
  return { side: from.side + delta * ease, distance: to.distance, height, meters };
}

/** Un son dans la scène : la source se branche sur input, la place change avec moveTo. */
type Spot = { input: GainNode; moveTo(place: Place, meters?: number): void };
type Path = { spot: Spot; from: Place; to: Place; start: number; duration: number };

let resonanceModule: Promise<typeof import("resonance-audio") | null> | null = null;
/** Charge Resonance une seule fois (à appeler tôt : pendant la préparation de la page). */
export function preloadResonance() {
  resonanceModule ??= import("resonance-audio").catch(() => null);
  return resonanceModule;
}

export class ScenePlayer {
  readonly ctx: BaseAudioContext;
  private master: GainNode;
  private analyser: AnalyserNode;
  private levels = new Uint8Array(512);
  private stereo: GainNode;
  private scene: ResonanceScene | null;
  private beds = new Map<GainNode, number>();
  private voiceSpots = new Map<string, Spot>();
  private cueSpots: Spot[] = [];
  private cueSlot = 0;
  private paths = new Set<Path>();
  private stopped = false;
  private timers: number[] = [];
  private live = new Set<AudioScheduledSourceNode>();

  private constructor(ctx: BaseAudioContext, scene: ResonanceScene | null) {
    this.ctx = ctx;
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -6, knee: 6, ratio: 12, attack: 0.003, release: 0.25 });
    limiter.connect(ctx.destination);
    this.master = new GainNode(ctx, { gain: 1 });
    this.master.connect(limiter);
    // Niveau du son : le globe de Tamilya gonfle au rythme de ce qu'on entend.
    this.analyser = new AnalyserNode(ctx, { fftSize: 512 });
    limiter.connect(this.analyser);
    // Ce qui ne passe pas par Resonance : la narratrice et le renfort gauche/droite.
    this.stereo = new GainNode(ctx, { gain: 1 });
    this.stereo.connect(this.master);
    this.scene = scene;
    scene?.output.connect(new GainNode(ctx, { gain: SCENE_GAIN })).connect(this.master);
    // Les déplacements suivent l'horloge du son. Hors ligne (essais), tick() est appelé à la main.
    if (typeof AudioContext !== "undefined" && ctx instanceof AudioContext) {
      this.timers.push(window.setInterval(() => this.tick(), 25));
    }
  }

  /** Scène prête dans ce lieu ; sans Resonance, le panneau 3D du navigateur. */
  static async create(ctx: BaseAudioContext, place: ScenePlace): Promise<ScenePlayer> {
    const resonance = await preloadResonance();
    let scene: ResonanceScene | null = null;
    if (resonance) {
      try {
        const room = ROOMS[place] ?? ROOMS["plein-air"];
        scene = new resonance.ResonanceAudio(ctx, { ambisonicOrder: 3, dimensions: room.dimensions, materials: room.materials });
      } catch {
        scene = null;
      }
    }
    return new ScenePlayer(ctx, scene);
  }

  get engine(): "resonance" | "hrtf" {
    return this.scene ? "resonance" : "hrtf";
  }

  private spot(place: Place, width = 0): Spot {
    const input = new GainNode(this.ctx, { gain: 1 });
    // Le son direct passe par les « oreilles » ; un son large (la pluie tout autour) presque pas.
    const ear = ears(this.ctx, this.stereo);
    input.connect(ear.input);
    const focus = 1 - 0.85 * Math.min(1, width / 180);
    // Le lieu (échos, réverbération) vient de Resonance : plus fort pour un son large, qui n'a que lui.
    const source = this.scene?.createSource({ minDistance: 0.8, maxDistance: 40, rolloff: "logarithmic", sourceWidth: width, gain: width ? 1.2 : ROOM_SEND });
    if (source) input.connect(source.input);
    const spot: Spot = {
      input,
      moveTo: (place, meters = METERS[place.distance]) => {
        if (source) {
          const p = point(place, meters);
          source.setPosition(p.x, p.y, p.z);
        }
        ear.set(place.side, (focus * DIRECT) / Math.max(0.7, meters) ** 0.7, place.height ?? "milieu");
      },
    };
    spot.moveTo(place);
    return spot;
  }

  /** Le son voyage de from à to, en arc autour de la tête. */
  private glide(spot: Spot, from: Place, to: Place, start: number, duration: number) {
    for (const path of this.paths) if (path.spot === spot) this.paths.delete(path);
    this.paths.add({ spot, from, to, start, duration: Math.max(0.05, duration) });
  }

  /** Avance les sons qui bougent (toutes les 25 ms). */
  tick() {
    const now = this.ctx.currentTime;
    for (const path of this.paths) {
      if (now < path.start) continue;
      const x = Math.min(1, (now - path.start) / path.duration);
      const position = between(path.from, path.to, x);
      path.spot.moveTo(position, position.meters);
      if (x >= 1) this.paths.delete(path);
    }
  }

  private track(source: AudioScheduledSourceNode) {
    this.live.add(source);
    source.addEventListener("ended", () => this.live.delete(source));
  }

  /** Attente sur l'horloge du son. */
  wait(seconds: number): Promise<void> {
    if (this.stopped || seconds <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const silence = new ConstantSourceNode(this.ctx, { offset: 0 });
      silence.connect(this.master);
      silence.onended = () => {
        silence.disconnect();
        resolve();
      };
      this.track(silence);
      silence.start();
      silence.stop(this.ctx.currentTime + seconds);
    });
  }

  /** Le décor de la page : chaque bruit à sa place, large, et qui dérive autour de la tête. */
  startAmbiences(ambiences: SceneAmbience[], fadeIn = 4) {
    const now = this.ctx.currentTime;
    for (const ambience of ambiences) {
      const source = new AudioBufferSourceNode(this.ctx, { buffer: soundBuffer(this.ctx, ambience.sound), loop: true });
      const bed = new GainNode(this.ctx, { gain: 0 });
      const place: Place = { side: ambience.side, distance: ambience.distance, height: ambience.height };
      const spot = this.spot(place, WIDTH[ambience.sound]);
      source.connect(bed).connect(spot.input);
      source.start(now, Math.random() * source.buffer!.duration);
      this.track(source);
      const level = 0.15 + ambience.volume * 0.55;
      bed.gain.setValueAtTime(0, now);
      bed.gain.linearRampToValueAtTime(level, now + fadeIn);
      this.beds.set(bed, level);
      // Même immobile, un bruit de fond respire un peu : la scène reste vivante.
      let current = place;
      const reach = ambience.moving ? 140 : 25;
      const every = ambience.moving ? 6 : 11;
      const move = () => {
        if (this.stopped) return;
        const next: Place = { ...place, side: ambience.side + (Math.random() * 2 - 1) * reach };
        this.glide(spot, current, next, this.ctx.currentTime, every - 0.3);
        current = next;
      };
      move();
      if (typeof window !== "undefined") this.timers.push(window.setInterval(move, every * 1000));
    }
  }

  private setBeds(ratio: number, timeConstant: number) {
    const now = this.ctx.currentTime;
    for (const [bed, level] of this.beds) {
      bed.gain.cancelScheduledValues(now);
      bed.gain.setTargetAtTime(level * ratio, now, timeConstant);
    }
  }

  /** Le décor baisse sous la voix et remonte entre les répliques. */
  duck(on: boolean) {
    this.setBeds(on ? 0.5 : 1, on ? 0.15 : 0.6);
  }

  fadeOutAmbiences(seconds = 5) {
    this.setBeds(0, seconds / 4);
  }

  /** Bruit court, à sa place ; s'il a une arrivée, il traverse pendant qu'il sonne. Renvoie sa durée. */
  playCue(cue: SoundCue, delay = 0): number {
    const buffer = soundBuffer(this.ctx, cue.sound);
    const at = this.ctx.currentTime + delay;
    const from: Place = { side: cue.from, distance: cue.distance, height: cue.height };
    // Quelques places réutilisées à tour de rôle : une source 3D de plus à chaque bruit ferait ramer le téléphone.
    const slot = this.cueSlot++ % CUE_SLOTS;
    const spot = (this.cueSpots[slot] ??= this.spot(from));
    this.glide(spot, from, from, at, 0.05);
    if (cue.to !== null) this.glide(spot, from, { ...from, side: cue.to }, at, buffer.duration);
    const source = new AudioBufferSourceNode(this.ctx, { buffer });
    source.connect(new GainNode(this.ctx, { gain: 0.8 })).connect(spot.input);
    source.start(at);
    this.track(source);
    return buffer.duration;
  }

  /** Une réplique : la narratrice au milieu de la tête, les personnages à leur place dans le lieu. */
  playLine(line: Pick<SceneLine, "voice" | "side" | "distance" | "height" | "from">, voice: AudioBuffer): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const source = new AudioBufferSourceNode(this.ctx, { buffer: voice });
    if (line.voice === null) {
      source.connect(this.stereo);
    } else {
      const to: Place = { side: line.side, distance: line.distance, height: line.height };
      // Une place par personnage, gardée d'une réplique à l'autre.
      let spot = this.voiceSpots.get(line.voice);
      if (!spot) this.voiceSpots.set(line.voice, (spot = this.spot(line.from ?? to)));
      this.glide(spot, line.from ?? to, line.from ?? to, this.ctx.currentTime, 0.05);
      // Quelqu'un qui s'approche ou qui passe : sa voix voyage pendant qu'il parle.
      if (line.from) this.glide(spot, line.from, to, this.ctx.currentTime, Math.max(0.8, voice.duration * 0.8));
      // Un personnage loin a besoin d'un peu plus de voix pour rester compréhensible.
      const far = line.distance === "loin" || line.from?.distance === "loin";
      source.connect(new GainNode(this.ctx, { gain: far ? 1.8 : 1.15 })).connect(spot.input);
    }
    return new Promise((resolve) => {
      source.onended = () => resolve();
      this.track(source);
      source.start();
    });
  }

  pause() {
    return (this.ctx as AudioContext).suspend();
  }

  resume() {
    return (this.ctx as AudioContext).resume();
  }

  /** Niveau de ce qu'on entend, de 0 à 1 (à lire à chaque image). */
  level(): number {
    this.analyser.getByteTimeDomainData(this.levels);
    let sum = 0;
    for (const v of this.levels) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / this.levels.length) * 4);
  }

  get isStopped() {
    return this.stopped;
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const ctx = this.ctx as AudioContext;
    // En pause, les sons arrêtés ne préviennent pas : on relance l'horloge pour finir proprement.
    void ctx.resume?.().catch(() => {});
    for (const timer of this.timers) window.clearInterval(timer);
    // Arrêter chaque son réveille les attentes en cours (onended) : la lecture se termine proprement.
    for (const source of this.live) {
      try {
        source.stop();
      } catch {
        // Déjà arrêté.
      }
    }
    window.setTimeout(() => void ctx.close?.().catch(() => {}), 300);
  }
}

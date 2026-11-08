import type { RoomDimensions, RoomMaterials, ResonanceAudio as ResonanceScene } from "resonance-audio";
import type { Ambience, Distance, Height, SceneAmbience, SceneLine, ScenePlace, SoundCue } from "./script";
import { BEDS, type Mood } from "./bank";
import { musicBuffer, prepareSounds, soundBuffer, soundInfo } from "./sounds";

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
 * - La narratrice reste au milieu de la tête, sans écho : c'est elle qui tient le livre. Quand
 *   elle imite un bruit (« toc, toc, toc »), sa voix sort de l'endroit du bruit, puis revient.
 * - Comme au cinéma, les voix et les bruits voyagent : par plusieurs points (quelqu'un qui tourne
 *   autour de la tête), en gardant leur place d'une réplique à l'autre ; un bruit qui passe d'un
 *   côté à l'autre frôle la tête, et sa hauteur de son monte puis descend (effet Doppler, un peu
 *   forcé pour qu'on l'entende). Au loin, l'air étouffe les aigus ; tout près, la voix a plus de
 *   graves et l'écart entre les oreilles grandit.
 *
 * Sans Resonance (chargement raté), le panneau 3D du navigateur (HRTF) prend le relais.
 * Toutes les attentes et tous les déplacements suivent l'horloge du son : la pause fige tout.
 */

const METERS: Record<Distance, number> = { "tout-pres": 0.7, pres: 1.6, loin: 6, "tres-loin": 14 };
/** Un cran plus près : le milieu d'un bruit qui passe d'un côté à l'autre. */
const CLOSER: Record<Distance, Distance> = { "tout-pres": "tout-pres", pres: "tout-pres", loin: "pres", "tres-loin": "loin" };
/** Vitesse du son (m/s) et grossissement de l'effet Doppler (aux distances d'une scène, il serait inaudible). */
const SOUND_SPEED = 343;
const DOPPLER = 5;
/** Hauteur en part de la distance (haut : ~40° au-dessus, bas : ~25° en dessous). */
const LIFT: Record<Height, number> = { haut: 0.85, milieu: 0, bas: -0.45 };
/** Largeur des bruits de fond, en degrés (360 : tout autour). */
const WIDTH = (sound: Ambience): number => soundInfo(sound)?.width ?? (sound in BEDS ? BEDS[sound as keyof typeof BEDS].width : 120);
/** Niveau du son direct (les « oreilles ») et part envoyée au lieu (Resonance) pour un son précis. */
const DIRECT = 1;
const ROOM_SEND = 0.55;
/** Resonance rend plus bas que le son direct : on le remonte. */
const SCENE_GAIN = 1.3;
/** Musique de fond sous les voix (fichiers à -18 LUFS) ; décor et musique baissent de moitié quand quelqu'un parle. */
const MUSIC_LEVEL = 0.32;
const DUCKED = 0.5;
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

/** Une place précise, pendant un déplacement : distance en mètres et hauteur continues. */
type Position = Place & { meters: number; lift: number };
type Located = Place & { meters?: number; lift?: number };

const liftOf = (place: Located) => place.lift ?? LIFT[place.height ?? "milieu"];

function point(place: Located, meters = METERS[place.distance]) {
  const r = (place.side * Math.PI) / 180;
  // Auditeur en (0,0,0), qui regarde vers -z ; la droite est +x, le haut +y.
  return { x: Math.sin(r) * meters, y: liftOf(place) * meters, z: -Math.cos(r) * meters };
}

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
  // Tout près, la voix gagne des graves (comme quelqu'un qui parle à l'oreille).
  const body = new BiquadFilterNode(ctx, { type: "lowshelf", frequency: 250, gain: 0 });
  input.connect(body);
  const merger = new ChannelMergerNode(ctx, { numberOfInputs: 2 });
  merger.connect(output);
  const side = (channel: number) => {
    const delay = new DelayNode(ctx, { maxDelayTime: 0.002, delayTime: 0 });
    const shadow = new BiquadFilterNode(ctx, { type: "lowpass", frequency: 18_000, Q: 0.5 });
    const air = new BiquadFilterNode(ctx, { type: "highshelf", frequency: 6_000, gain: 0 });
    const gain = new GainNode(ctx, { gain: 0 });
    body.connect(delay).connect(shadow).connect(air).connect(gain).connect(merger, 0, channel);
    return { delay, shadow, air, gain };
  };
  const left = side(0);
  const right = side(1);
  const smooth = (param: AudioParam, value: number) => param.setTargetAtTime(value, ctx.currentTime, 0.015);
  return {
    input,
    set(angle: number, level: number, lift: number, meters: number) {
      const r = (angle * Math.PI) / 180;
      const lateral = Math.abs(Math.sin(r));
      const front = Math.cos(r);
      const itd = 0.000255 * (Math.asin(lateral) + lateral);
      const [near, far] = Math.sin(r) >= 0 ? [right, left] : [left, right];
      const behind = Math.max(0, -front);
      // L'air étouffe les aigus avec la distance (≈ 15 kHz à 1,6 m, 7 kHz à 6 m, 4,5 kHz à 14 m).
      const distant = 20_000 * Math.min(1, 1 / Math.max(1, meters) ** 0.55);
      const back = Math.min(distant, 18_000 * (4_500 / 18_000) ** behind);
      // Tout près, l'oreille opposée est encore plus dans l'ombre de la tête.
      const close = Math.max(0, Math.min(1, (1.2 - meters) / 0.5));
      smooth(body.gain, 5 * close);
      smooth(near.delay.delayTime, 0);
      smooth(far.delay.delayTime, itd);
      smooth(near.shadow.frequency, back);
      smooth(far.shadow.frequency, Math.min(back, 18_000 * (1_400 / 18_000) ** lateral));
      smooth(near.gain.gain, level * (1 + 0.25 * lateral));
      smooth(far.gain.gain, level * (1 - (0.8 + 0.12 * close) * lateral));
      const shine = lift >= 0 ? lift * 5.9 : lift * 8.9;
      smooth(near.air.gain, shine);
      smooth(far.air.gain, shine);
    },
  };
}

/** Longueur d'un bout de trajet (arc autour de la tête + rapprochement), pour garder une vitesse régulière. */
function stretch(from: Place, to: Place): number {
  let delta = Math.abs(to.side - from.side) % 360;
  if (delta > 180) delta = 360 - delta;
  const a = METERS[from.distance];
  const b = METERS[to.distance];
  return ((delta * Math.PI) / 180) * ((a + b) / 2) + Math.abs(b - a) + Math.abs(LIFT[to.height ?? "milieu"] - LIFT[from.height ?? "milieu"]) + 0.01;
}

/** Entre deux places, sans ralentir (x de 0 à 1). */
function lerp(from: Place, to: Place, x: number): Position {
  let delta = to.side - from.side;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const a = LIFT[from.height ?? "milieu"];
  const lift = a + (LIFT[to.height ?? "milieu"] - a) * x;
  const height: Height = lift > 0.4 ? "haut" : lift < -0.2 ? "bas" : "milieu";
  const meters = METERS[from.distance] + (METERS[to.distance] - METERS[from.distance]) * x;
  let side = from.side + delta * x;
  if (side > 180) side -= 360;
  if (side < -180) side += 360;
  return { side, distance: x < 0.5 ? from.distance : to.distance, height, meters, lift };
}

/** Le long d'un trajet à plusieurs points : démarre et s'arrête en douceur, vitesse régulière entre les deux. */
export function along(points: Place[], x: number): Position {
  if (points.length === 1) return lerp(points[0], points[0], 0);
  const ease = x * x * (3 - 2 * x);
  const lengths = points.slice(1).map((to, i) => stretch(points[i], to));
  let rest = ease * lengths.reduce((sum, l) => sum + l, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (rest <= lengths[i] || i === lengths.length - 1) return lerp(points[i], points[i + 1], Math.min(1, rest / lengths[i]));
    rest -= lengths[i];
  }
  return lerp(points[0], points[0], 0);
}

/** Un bruit qui passe d'un côté à l'autre frôle la tête au lieu de tourner autour à distance égale. */
export function flyby(from: Place, to: Place): Place[] {
  let delta = to.side - from.side;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  if (Math.abs(delta) < 120 || from.distance === "tout-pres") return [from, to];
  const middle: Place = { side: from.side + delta / 2, distance: CLOSER[from.distance], height: from.height };
  return [from, middle, to];
}

/** Entre deux places, en arc autour de la tête (plus court chemin : de 170 à -170, par derrière). */
export function between(from: Place, to: Place, x: number): Position {
  return along([from, to], x);
}

/** Un son dans la scène : la source se branche sur input, la place change avec moveTo. */
type Spot = { input: GainNode; moveTo(place: Located): void };
/** rate : la vitesse de lecture du son, pour l'effet Doppler (bruits seulement : sur une voix, ce serait faux). */
type Path = { spot: Spot; points: Place[]; start: number; duration: number; rate?: AudioParam; last?: { meters: number; time: number } };

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
  private music: { gain: GainNode; source: AudioBufferSourceNode } | null = null;
  private wantedMusic: Mood | null = null;
  private ducked = false;
  private voiceSpots = new Map<string, Spot>();
  /** Où chaque voix s'est arrêtée : elle repart de là à la réplique suivante. */
  private voicePlaces = new Map<string, Place>();
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
      moveTo: (place) => {
        const meters = place.meters ?? METERS[place.distance];
        if (source) {
          const p = point(place, meters);
          source.setPosition(p.x, p.y, p.z);
        }
        ear.set(place.side, (focus * DIRECT) / Math.max(0.7, meters) ** 0.7, liftOf(place), meters);
      },
    };
    spot.moveTo(place);
    return spot;
  }

  /** Le son voyage par ces points, en arc autour de la tête (un seul point : il se pose là). */
  private glide(spot: Spot, points: Place[], start: number, duration: number, rate?: AudioParam) {
    for (const path of this.paths) {
      if (path.spot !== spot) continue;
      path.rate?.cancelScheduledValues(start);
      this.paths.delete(path);
    }
    this.paths.add({ spot, points, start, duration: Math.max(0.05, duration), rate });
  }

  /** Avance les sons qui bougent (toutes les 25 ms). */
  tick() {
    const now = this.ctx.currentTime;
    for (const path of this.paths) {
      if (now < path.start) continue;
      const x = Math.min(1, (now - path.start) / path.duration);
      const position = along(path.points, x);
      path.spot.moveTo(position);
      if (path.rate) {
        // Qui s'approche sonne plus aigu, qui s'éloigne plus grave.
        if (path.last && now > path.last.time) {
          const speed = (position.meters - path.last.meters) / (now - path.last.time);
          const rate = Math.max(0.85, Math.min(1.18, SOUND_SPEED / (SOUND_SPEED + DOPPLER * speed)));
          path.rate.setTargetAtTime(x >= 1 ? 1 : rate, now, 0.06);
        }
        path.last = { meters: position.meters, time: now };
      }
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

  /** Attend (au plus timeoutMs) que les enregistrements de ces sons soient prêts. */
  prepare(sounds: Iterable<SceneAmbience["sound"] | SoundCue["sound"]>, timeoutMs?: number) {
    return prepareSounds(this.ctx, sounds, timeoutMs);
  }

  /** Le décor de la page : chaque bruit à sa place, large, et qui dérive autour de la tête. */
  startAmbiences(ambiences: SceneAmbience[], fadeIn = 4) {
    const now = this.ctx.currentTime;
    for (const ambience of ambiences) {
      const buffer = soundBuffer(this.ctx, ambience.sound);
      if (!buffer) continue;
      const source = new AudioBufferSourceNode(this.ctx, { buffer, loop: true });
      const bed = new GainNode(this.ctx, { gain: 0 });
      const place: Place = { side: ambience.side, distance: ambience.distance, height: ambience.height };
      const spot = this.spot(place, WIDTH(ambience.sound));
      source.connect(bed).connect(spot.input);
      source.start(now, Math.random() * buffer.duration);
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
        this.glide(spot, [current, next], this.ctx.currentTime, every - 0.3);
        current = next;
      };
      move();
      if (typeof window !== "undefined") this.timers.push(window.setInterval(move, every * 1000));
    }
  }

  /**
   * Musique de fond : au milieu de la tête, sous les voix, sans écho de lieu (elle n'est pas dans la
   * scène, comme au cinéma). Elle démarre dès qu'elle est arrivée, sans retenir l'histoire ; une
   * nouvelle ambiance remplace l'ancienne en fondu, null l'arrête.
   */
  async setMusic(mood: Mood | null, fade = 3) {
    if (this.stopped || mood === this.wantedMusic) return;
    this.wantedMusic = mood;
    const old = this.music;
    if (old) {
      this.music = null;
      this.beds.delete(old.gain);
      const now = this.ctx.currentTime;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setTargetAtTime(0, now, fade / 4);
      old.source.stop(now + fade * 1.5);
    }
    if (!mood) return;
    const buffer = await musicBuffer(this.ctx, mood);
    if (!buffer || this.stopped || this.wantedMusic !== mood) return;
    const source = new AudioBufferSourceNode(this.ctx, { buffer, loop: true });
    const gain = new GainNode(this.ctx, { gain: 0 });
    source.connect(gain).connect(this.stereo);
    const now = this.ctx.currentTime;
    source.start(now);
    this.track(source);
    this.beds.set(gain, MUSIC_LEVEL);
    gain.gain.setTargetAtTime(MUSIC_LEVEL * (this.ducked ? DUCKED : 1), now, fade / 4);
    this.music = { gain, source };
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
    this.ducked = on;
    this.setBeds(on ? DUCKED : 1, on ? 0.15 : 0.6);
  }

  /** Décor et musique s'éteignent (fin de l'histoire) ; une musique encore en route ne démarrera pas. */
  fadeOutAmbiences(seconds = 5) {
    this.wantedMusic = null;
    this.setBeds(0, seconds / 4);
  }

  /** Bruit court, à sa place ; s'il a un trajet, il voyage pendant qu'il sonne. Renvoie sa durée (0 s'il n'est pas arrivé). */
  playCue(cue: SoundCue, delay = 0): number {
    const buffer = soundBuffer(this.ctx, cue.sound);
    if (!buffer) return 0;
    const at = this.ctx.currentTime + delay;
    const from: Place = { side: cue.from, distance: cue.distance, height: cue.height };
    const path: Place[] = cue.path ?? (cue.to === null ? [] : [{ ...from, side: cue.to }]);
    const points = path.length === 1 ? flyby(from, path[0]) : [from, ...path];
    // Quelques places réutilisées à tour de rôle : une source 3D de plus à chaque bruit ferait ramer le téléphone.
    const slot = this.cueSlot++ % CUE_SLOTS;
    const spot = (this.cueSpots[slot] ??= this.spot(from));
    const source = new AudioBufferSourceNode(this.ctx, { buffer });
    this.glide(spot, [from], at, 0.05);
    if (points.length > 1) this.glide(spot, points, at, buffer.duration, source.playbackRate);
    source.connect(new GainNode(this.ctx, { gain: 0.8 })).connect(spot.input);
    source.start(at);
    this.track(source);
    return buffer.duration;
  }

  /**
   * Une réplique : la narratrice au milieu de la tête (ou à l'endroit du bruit qu'elle imite),
   * les personnages à leur place dans le lieu, qu'ils rejoignent en marchant s'ils en changent.
   */
  playLine(line: Pick<SceneLine, "voice" | "side" | "distance" | "height" | "from"> & Partial<Pick<SceneLine, "path" | "placed">>, voice: AudioBuffer): Promise<void> {
    if (this.stopped) return Promise.resolve();
    const source = new AudioBufferSourceNode(this.ctx, { buffer: voice });
    if (line.voice === null && !line.placed) {
      source.connect(this.stereo);
    } else {
      const key = line.voice ?? "narratrice";
      const to: Place = { side: line.side, distance: line.distance, height: line.height };
      // La narratrice qui imite un bruit part toujours de l'endroit du bruit ; un personnage repart d'où il était.
      const start = line.from ?? (line.voice ? this.voicePlaces.get(key) : undefined) ?? to;
      const points = [start, ...(line.path ?? []), to].filter(
        (p, i, all) => i === 0 || p.side !== all[i - 1].side || p.distance !== all[i - 1].distance || p.height !== all[i - 1].height,
      );
      this.voicePlaces.set(key, to);
      // Une place par voix, gardée d'une réplique à l'autre.
      let spot = this.voiceSpots.get(key);
      if (!spot) this.voiceSpots.set(key, (spot = this.spot(start)));
      this.glide(spot, [start], this.ctx.currentTime, 0.05);
      if (points.length > 1) {
        // Un trajet décrit dure toute la réplique ; un simple changement de place, quelques pas.
        const travels = Boolean(line.from) || Boolean(line.path?.length);
        const duration = travels ? Math.max(0.8, voice.duration * 0.85) : Math.min(1.6, Math.max(0.6, voice.duration * 0.4));
        this.glide(spot, points, this.ctx.currentTime, duration);
      }
      // Une voix loin a besoin d'un peu plus de force pour rester compréhensible.
      const far = points.some((p) => p.distance === "tres-loin") ? 2.4 : points.some((p) => p.distance === "loin") ? 1.8 : 1.15;
      source.connect(new GainNode(this.ctx, { gain: far })).connect(spot.input);
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

import { BEDS, RECORDED, musicUrl, soundUrl, type Ambience, type Effect, type Mood } from "./bank";
import type { PlayableSound, PlayableSounds } from "./catalog";

/**
 * Bruits de la lecture en 3D. Les vrais enregistrements (bank.ts, public/sons) passent en premier ;
 * sinon le téléphone fabrique le bruit à partir de bruit blanc et de sons purs, sans rien télécharger
 * (le débit de Mayotte est ~20 Ko/s). Chaque bruit de fond est une boucle sans couture ; chaque bruit
 * court se joue une fois. Tout est mono : la place vient du panneau 3D.
 */

type Fill = (out: Float32Array, sr: number) => void;

const TAU = Math.PI * 2;
const white = () => Math.random() * 2 - 1;
const coef = (fc: number, sr: number) => 1 - Math.exp((-TAU * fc) / sr);

function lowpass(data: Float32Array, sr: number, fc: number | ((i: number) => number)) {
  let y = 0;
  const fixed = typeof fc === "number" ? coef(fc, sr) : 0;
  for (let i = 0; i < data.length; i++) {
    const a = typeof fc === "number" ? fixed : coef(fc(i), sr);
    y += a * (data[i] - y);
    data[i] = y;
  }
  return data;
}

function highpass(data: Float32Array, sr: number, fc: number) {
  let low = 0;
  const a = coef(fc, sr);
  for (let i = 0; i < data.length; i++) {
    low += a * (data[i] - low);
    data[i] -= low;
  }
  return data;
}

const noise = (n: number) => Float32Array.from({ length: n }, white);

/** Bruit « brun » : grave et sourd (vent lointain, grondement). */
function brown(n: number) {
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    y = (y + white() * 0.02) * 0.998;
    out[i] = y;
  }
  return out;
}

function normalize(data: Float32Array, peak = 0.9) {
  let max = 0;
  for (const v of data) max = Math.max(max, Math.abs(v));
  if (max > 0) for (let i = 0; i < data.length; i++) data[i] = (data[i] / max) * peak;
  return data;
}

function mix(into: Float32Array, add: Float32Array, gain = 1) {
  for (let i = 0; i < into.length; i++) into[i] += add[i] * gain;
  return into;
}

/** Petit son pur qui s'éteint (goutte, bulle, coup sourd). */
function blip(out: Float32Array, sr: number, at: number, freq: number, decay: number, gain: number, sweep = 0) {
  const start = Math.floor(at * sr);
  const length = Math.min(out.length - start, Math.floor(decay * 6 * sr));
  let phase = 0;
  for (let k = 0; k < length; k++) {
    const t = k / sr;
    phase += (TAU * freq * (1 + sweep * t)) / sr;
    out[start + k] += Math.sin(phase) * Math.exp(-t / decay) * gain;
  }
}

/** Petit bruit qui s'éteint (crépitement, pas, éclaboussure). */
function burst(out: Float32Array, sr: number, at: number, decay: number, gain: number, attack = 0) {
  const start = Math.floor(at * sr);
  const length = Math.min(out.length - start, Math.floor((decay * 6 + attack) * sr));
  for (let k = 0; k < length; k++) {
    const t = k / sr;
    const env = attack && t < attack ? t / attack : Math.exp(-(t - attack) / decay);
    out[start + k] += white() * env * gain;
  }
}

/** Chant d'oiseau : quelques notes glissées. */
function birdCall(out: Float32Array, sr: number, at: number, gain: number) {
  const notes = 3 + Math.floor(Math.random() * 4);
  const base = 2200 + Math.random() * 1800;
  const down = Math.random() < 0.5;
  let t0 = at;
  for (let n = 0; n < notes; n++) {
    const length = 0.05 + Math.random() * 0.08;
    const start = Math.floor(t0 * sr);
    const count = Math.min(out.length - start, Math.floor(length * sr));
    const f0 = base * (1 + (Math.random() - 0.5) * 0.2);
    const f1 = f0 * (down ? 0.7 : 1.4);
    let phase = 0;
    for (let k = 0; k < count; k++) {
      const x = k / count;
      phase += (TAU * (f0 + (f1 - f0) * x)) / sr;
      out[start + k] += Math.sin(phase) * Math.sin(Math.PI * x) ** 2 * gain;
    }
    t0 += length + 0.03 + Math.random() * 0.05;
  }
}

/** Boucle sans couture : la fin se fond dans le début. */
function loop(fill: Fill): Fill {
  return (out, sr) => {
    const fade = Math.floor(sr * 0.4);
    const work = new Float32Array(out.length + fade);
    fill(work, sr);
    for (let i = 0; i < out.length; i++) out[i] = work[i];
    for (let i = 0; i < fade; i++) {
      const x = i / fade;
      out[i] = work[i] * Math.sqrt(x) + work[out.length + i] * Math.sqrt(1 - x);
    }
  };
}

const AMBIENCE_FILLS: Partial<Record<Ambience, [seconds: number, fill: Fill]>> = {
  vent: [
    8,
    loop((out, sr) => {
      const n = out.length;
      const base = brown(n);
      // Le souffle monte et descend, et sa couleur change avec lui.
      const gust = (i: number) => 0.45 + 0.35 * Math.sin((TAU * i) / (sr * 8)) ** 2 + 0.2 * Math.sin((TAU * i) / (sr * 2.7)) ** 2;
      lowpass(base, sr, (i) => 250 + 700 * gust(i));
      highpass(base, sr, 120);
      const whistle = lowpass(highpass(noise(n), sr, 900), sr, 1400);
      for (let i = 0; i < n; i++) out[i] = (base[i] * 6 + whistle[i] * 0.25 * gust(i) ** 3) * gust(i);
      normalize(out, 0.8);
    }),
  ],
  pluie: [
    6,
    loop((out, sr) => {
      const n = out.length;
      mix(out, lowpass(highpass(noise(n), sr, 700), sr, 6000), 0.35);
      const drops = new Float32Array(n);
      const count = Math.floor((n / sr) * 220);
      for (let d = 0; d < count; d++) burst(drops, sr, Math.random() * (n / sr), 0.0012 + Math.random() * 0.002, Math.random() ** 2);
      mix(out, highpass(drops, sr, 1500), 0.9);
      normalize(out, 0.75);
    }),
  ],
  vagues: [
    9,
    loop((out, sr) => {
      const n = out.length;
      const body = lowpass(noise(n), sr, 450);
      const foam = lowpass(highpass(noise(n), sr, 1800), sr, 7000);
      for (let i = 0; i < n; i++) {
        const x = (i / (sr * 9)) % 1;
        // La vague monte lentement, se brise, puis l'écume se retire.
        const swell = 0.15 + 0.85 * (0.5 - 0.5 * Math.cos(TAU * x)) ** 2;
        const crash = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (x - 0.45) / 0.45)))) ** 1.5;
        out[i] = body[i] * 3 * swell + foam[i] * 0.6 * crash;
      }
      normalize(out, 0.8);
    }),
  ],
  riviere: [
    6,
    loop((out, sr) => {
      const n = out.length;
      mix(out, lowpass(highpass(noise(n), sr, 500), sr, 3000), 0.4);
      const count = Math.floor((n / sr) * 70);
      for (let b = 0; b < count; b++) blip(out, sr, Math.random() * (n / sr), 500 + Math.random() * 900, 0.006 + Math.random() * 0.008, 0.25 * Math.random(), 25);
      normalize(out, 0.7);
    }),
  ],
  feu: [
    7,
    loop((out, sr) => {
      const n = out.length;
      mix(out, lowpass(brown(n), sr, 220), 4);
      const cracks = new Float32Array(n);
      const count = Math.floor((n / sr) * 18);
      for (let c = 0; c < count; c++) {
        const at = Math.random() * (n / sr);
        burst(cracks, sr, at, 0.0006 + Math.random() * 0.001, 0.4 + Math.random());
        if (Math.random() < 0.15) burst(cracks, sr, at + 0.01, 0.004, 1.2);
      }
      mix(out, highpass(cracks, sr, 1200));
      normalize(out, 0.75);
    }),
  ],
  nuit: [
    4,
    loop((out, sr) => {
      const n = out.length;
      mix(out, lowpass(brown(n), sr, 300), 1.2);
      // Deux grillons qui ne chantent pas au même rythme.
      const cricket = (freq: number, period: number, offset: number, gain: number) => {
        for (let t = offset; t < n / sr; t += period) {
          for (let p = 0; p < 3; p++) {
            const start = Math.floor((t + p * 0.04) * sr);
            const count = Math.min(n - start, Math.floor(0.025 * sr));
            for (let k = 0; k < count; k++) out[start + k] += Math.sin((TAU * freq * k) / sr) * Math.sin((Math.PI * k) / count) * gain;
          }
        }
      };
      cricket(4300, 0.5, 0.05, 0.25);
      cricket(3800, 0.8, 0.3, 0.18);
      normalize(out, 0.6);
    }),
  ],
  oiseaux: [
    10,
    loop((out, sr) => {
      const n = out.length;
      mix(out, lowpass(highpass(noise(n), sr, 1500), sr, 4000), 0.04);
      const calls = 6 + Math.floor(Math.random() * 4);
      for (let c = 0; c < calls; c++) birdCall(out, sr, Math.random() * (n / sr - 1), 0.2 + Math.random() * 0.3);
      normalize(out, 0.6);
    }),
  ],
  foret: [
    10,
    loop((out, sr) => {
      const n = out.length;
      const leaves = lowpass(highpass(noise(n), sr, 1200), sr, 5000);
      for (let i = 0; i < n; i++) out[i] = leaves[i] * (0.3 + 0.7 * Math.sin((TAU * i) / (sr * 5)) ** 4) * 0.5;
      for (let c = 0; c < 4; c++) birdCall(out, sr, Math.random() * (n / sr - 1), 0.12);
      normalize(out, 0.55);
    }),
  ],
};

const EFFECT_FILLS: Partial<Record<Effect, [seconds: number, fill: Fill]>> = {
  tonnerre: [
    5,
    (out, sr) => {
      const n = out.length;
      burst(out, sr, 0, 0.05, 0.9);
      highpass(out, sr, 400);
      const rumble = lowpass(brown(n), sr, 140);
      const wobble = lowpass(noise(n), sr, 3);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const env = Math.min(1, t / 0.25) * Math.exp(-t / 1.4);
        out[i] += rumble[i] * 12 * env * (0.6 + 4 * Math.abs(wobble[i]));
      }
      normalize(out, 0.95);
    },
  ],
  // Pas sur du gravier : un crissement plein d'aigus, que l'oreille sait placer (un pas sourd et
  // grave se place mal : on ne l'entendait pas passer d'une oreille à l'autre).
  pas: [
    4,
    (out, sr) => {
      const n = out.length;
      const crunch = new Float32Array(n);
      for (let s = 0; s < 7; s++) {
        const at = 0.1 + s * 0.55 + (Math.random() - 0.5) * 0.04;
        // Talon puis pointe du pied : deux grappes de petits grains.
        for (const [offset, grains] of [
          [0, 45],
          [0.09, 30],
        ] as const) {
          for (let g = 0; g < grains; g++) {
            const t = at + offset + Math.random() ** 2 * 0.12;
            burst(crunch, sr, t, 0.0004 + Math.random() * 0.0012, (0.3 + Math.random() * 0.7) * (offset ? 0.7 : 1));
          }
        }
        blip(out, sr, at, 85, 0.03, 0.25);
      }
      mix(out, lowpass(highpass(crunch, sr, 1200), sr, 9000), 1.2);
      normalize(out, 0.85);
    },
  ],
  coeur: [
    3.6,
    (out, sr) => {
      for (let b = 0; b < 4; b++) {
        blip(out, sr, b * 0.9, 55, 0.07, 1);
        blip(out, sr, b * 0.9 + 0.28, 68, 0.05, 0.6);
      }
      normalize(out, 0.95);
    },
  ],
  rafale: [
    3,
    (out, sr) => {
      const n = out.length;
      const base = brown(n);
      const bell = (i: number) => Math.sin((Math.PI * i) / n) ** 2;
      lowpass(base, sr, (i) => 300 + 1100 * bell(i));
      highpass(base, sr, 150);
      for (let i = 0; i < n; i++) out[i] = base[i] * bell(i);
      normalize(out, 0.85);
    },
  ],
  frappe: [
    1.2,
    (out, sr) => {
      for (const at of [0.05, 0.33, 0.61]) {
        blip(out, sr, at, 165, 0.04, 1);
        blip(out, sr, at, 330, 0.02, 0.4);
        burst(out, sr, at, 0.003, 0.5);
      }
      lowpass(out, sr, 2500);
      normalize(out, 0.9);
    },
  ],
  eclaboussure: [
    1.4,
    (out, sr) => {
      const n = out.length;
      const splash = new Float32Array(n);
      burst(splash, sr, 0.02, 0.18, 1, 0.01);
      for (let d = 0; d < 25; d++) burst(splash, sr, 0.05 + Math.random() * 0.9, 0.002, Math.random() * 0.5);
      mix(out, highpass(splash, sr, 600));
      normalize(out, 0.85);
    },
  ],
  galop: [
    3,
    (out, sr) => {
      const n = out.length;
      const hits = new Float32Array(n);
      for (let g = 0; g < 6; g++) {
        for (const [dt, gain] of [
          [0, 0.7],
          [0.09, 0.8],
          [0.2, 1],
        ] as const) {
          const at = 0.05 + g * 0.48 + dt;
          burst(hits, sr, at, 0.012, gain, 0.002);
          blip(out, sr, at, 90, 0.03, gain * 0.6);
        }
      }
      mix(out, lowpass(hits, sr, 1400));
      normalize(out, 0.85);
    },
  ],
};

function render(ctx: BaseAudioContext, [seconds, fill]: [number, Fill]) {
  const buffer = ctx.createBuffer(1, Math.floor(seconds * ctx.sampleRate), ctx.sampleRate);
  fill(buffer.getChannelData(0), ctx.sampleRate);
  return buffer;
}

const recipeOf = (sound: Ambience | Effect) => AMBIENCE_FILLS[sound] ?? EFFECT_FILLS[sound];

/** Sons qui existent en version fabriquée (secours quand l'enregistrement n'est pas arrivé). */
export const SYNTHESIZED = [...Object.keys(AMBIENCE_FILLS), ...Object.keys(EFFECT_FILLS)] as (Ambience | Effect)[];

/**
 * Catalogue du moment (/admin/sons), reçu au début de chaque histoire : adresse de chaque son,
 * largeur des décors, sons qui font peur, musiques légères. Sans lui, les sons d'origine.
 */
let catalog: PlayableSounds | null = null;
export function setSoundCatalog(sounds: PlayableSounds | null | undefined) {
  if (sounds && typeof sounds === "object") catalog = sounds;
}
export const soundInfo = (sound: string): PlayableSound | undefined => catalog?.[sound];

/** Adresse du fichier d'un son ; null : pas de fichier (version fabriquée seulement). */
function urlOf(sound: string): string | null {
  if (catalog) return catalog[sound]?.url ?? null;
  return RECORDED.has(sound) ? soundUrl(sound) : null;
}
const isBed = (sound: string) => (catalog?.[sound] ? catalog[sound].kind === "decor" : sound in BEDS);

/** Un son est jouable s'il a un enregistrement ou une version fabriquée. */
export const isPlayable = (sound: Ambience | Effect) => urlOf(sound) !== null || recipeOf(sound) !== undefined;

/**
 * Fichiers téléchargés, rangés par adresse et partagés par tous les contextes audio : chaque son ne
 * passe qu'une fois sur le réseau (et le navigateur le garde ensuite en cache).
 */
const bytes = new Map<string, Promise<ArrayBuffer | null>>();

function download(url: string) {
  let data = bytes.get(url);
  if (!data) {
    data = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    bytes.set(url, data);
  }
  return data;
}

/** Lance le téléchargement des sons (dès que le script les annonce, avant qu'on en ait besoin). */
export function preloadSounds(sounds: Iterable<Ambience | Effect>) {
  for (const sound of sounds) {
    const url = urlOf(sound);
    if (url) void download(url);
  }
}

/** Boucle sans couture pour un enregistrement : la fin se fond dans le début. */
function seamless(ctx: BaseAudioContext, buffer: AudioBuffer) {
  const fade = Math.min(Math.floor(ctx.sampleRate * 0.6), Math.floor(buffer.length / 4));
  const out = ctx.createBuffer(1, buffer.length - fade, buffer.sampleRate);
  const src = buffer.getChannelData(0);
  const dst = out.getChannelData(0);
  dst.set(src.subarray(0, out.length));
  for (let i = 0; i < fade; i++) {
    const x = i / fade;
    dst[i] = src[i] * Math.sqrt(x) + src[out.length + i] * Math.sqrt(1 - x);
  }
  return out;
}

const cache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();
const recorded = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

/**
 * Prépare les enregistrements pour ce contexte audio. Attend au plus timeoutMs : ce qui n'est pas
 * arrivé sera joué en version fabriquée (ou pas du tout s'il n'y en a pas).
 */
export async function prepareSounds(ctx: BaseAudioContext, sounds: Iterable<Ambience | Effect>, timeoutMs = 2500) {
  let ready = recorded.get(ctx);
  if (!ready) recorded.set(ctx, (ready = new Map()));
  const done = ready;
  const jobs = [...new Set(sounds)]
    .map((sound) => ({ sound, url: urlOf(sound) }))
    .filter((s): s is { sound: string; url: string } => s.url !== null && !done.has(s.url))
    .map(async ({ sound, url }) => {
      const data = await download(url);
      if (!data) return;
      try {
        // decodeAudioData vide le tableau qu'on lui donne : on garde l'original pour les autres contextes.
        const buffer = await ctx.decodeAudioData(data.slice(0));
        done.set(url, isBed(sound) ? seamless(ctx, buffer) : buffer);
      } catch {
        // Fichier illisible sur ce téléphone : la version fabriquée prendra le relais.
      }
    });
  await Promise.race([Promise.all(jobs), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/** Son prêt à jouer : l'enregistrement s'il est prêt, sinon la version fabriquée, sinon null. */
export function soundBuffer(ctx: BaseAudioContext, sound: Ambience | Effect): AudioBuffer | null {
  const url = urlOf(sound);
  const real = url ? recorded.get(ctx)?.get(url) : undefined;
  if (real) return real;
  const recipe = recipeOf(sound);
  if (!recipe) return null;
  let sounds = cache.get(ctx);
  if (!sounds) cache.set(ctx, (sounds = new Map()));
  let buffer = sounds.get(sound);
  if (!buffer) {
    buffer = render(ctx, recipe);
    sounds.set(sound, buffer);
  }
  return buffer;
}

/** Lance le téléchargement d'une musique de fond (~130 Ko, déjà en boucle sans couture). */
export function preloadMusic(mood: Mood): Promise<ArrayBuffer | null> {
  const url = catalog ? (catalog[mood]?.kind === "musique" ? catalog[mood].url : null) : musicUrl(mood);
  return url ? download(url) : Promise.resolve(null);
}

const music = new WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer | null>>>();

/** La musique prête à jouer dans ce contexte, quand elle est arrivée ; null si elle n'arrive pas. */
export function musicBuffer(ctx: BaseAudioContext, mood: Mood): Promise<AudioBuffer | null> {
  let ready = music.get(ctx);
  if (!ready) music.set(ctx, (ready = new Map()));
  const key = catalog?.[mood]?.url ?? mood;
  let buffer = ready.get(key);
  if (!buffer) {
    buffer = preloadMusic(mood).then((data) => (data ? ctx.decodeAudioData(data.slice(0)).catch(() => null) : null));
    ready.set(key, buffer);
  }
  return buffer;
}

/** Exposé pour les tests : fabrique un bruit sans contexte audio. */
export function renderSamples(sound: Ambience | Effect, sr = 16_000): Float32Array {
  const recipe = recipeOf(sound);
  if (!recipe) throw new Error(`${sound} n'a pas de version fabriquée`);
  const [seconds, fill] = recipe;
  const out = new Float32Array(Math.floor(seconds * sr));
  fill(out, sr);
  return out;
}

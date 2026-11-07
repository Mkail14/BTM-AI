/**
 * Empreinte de voix : reconnaître qui parle à Tamilya.
 *
 * Modèle WeSpeaker ResNet34-LM (VoxCeleb, licence CC BY 4.0 : voir
 * public/voiceprint/LICENCE.txt), allégé en 8 bits (6,7 Mo au lieu de 26,5,
 * mêmes résultats), exécuté dans le navigateur par onnxruntime-web (le même
 * moteur que Silero). Il reçoit le
 * son découpé en tranches de 25 ms (« fbank » 80 bandes, calcul identique à
 * Kaldi) et rend 256 nombres : l'empreinte. Deux empreintes de la même
 * personne sont proches (cosinus élevé), même d'une langue à l'autre.
 *
 * Seule l'empreinte quitte le téléphone (jamais le son), et le serveur décide :
 * voir /api/voice/print.
 */

import type * as Ort from "onnxruntime-web";
import { ortWasmPath } from "./ort-path";

const RATE = 16000;
const FRAME = 400; // 25 ms
const SHIFT = 160; // 10 ms
const FFT = 512;
const MELS = 80;
const EPS = 1.1920929e-7;

/** Moins d'une seconde de voix : l'empreinte n'est pas fiable. */
export const MIN_SAMPLES = RATE;

let window_: Float32Array | null = null;
let banks: { start: number; weights: Float32Array }[] | null = null;

function povey(): Float32Array {
  if (window_) return window_;
  window_ = new Float32Array(FRAME);
  for (let i = 0; i < FRAME; i++) window_[i] = Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FRAME - 1)), 0.85);
  return window_;
}

const mel = (f: number) => 1127 * Math.log(1 + f / 700);

/** Filtres triangulaires de Kaldi (20 Hz à 8 kHz). */
function melBanks() {
  if (banks) return banks;
  const bins = FFT / 2;
  const width = RATE / FFT;
  const low = mel(20);
  const high = mel(RATE / 2);
  const delta = (high - low) / (MELS + 1);
  banks = [];
  for (let m = 0; m < MELS; m++) {
    const left = low + m * delta;
    const center = left + delta;
    const right = center + delta;
    const weights: number[] = [];
    let start = -1;
    for (let i = 0; i < bins; i++) {
      const v = mel(i * width);
      const w = v > left && v < right ? (v <= center ? (v - left) / (center - left) : (right - v) / (right - center)) : 0;
      if (w > 0) {
        if (start < 0) start = i;
        weights[i - start] = w;
      } else if (start >= 0) break;
    }
    banks.push({ start: Math.max(start, 0), weights: Float32Array.from(weights) });
  }
  return banks;
}

/** FFT réelle en place (radix 2), renvoie la puissance des FFT/2 premières raies. */
function power(frame: Float32Array): Float32Array {
  const re = new Float64Array(FFT);
  const im = new Float64Array(FFT);
  re.set(frame);
  for (let i = 1, j = 0; i < FFT; i++) {
    let bit = FFT >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) [re[i], re[j]] = [re[j], re[i]];
  }
  for (let len = 2; len <= FFT; len <<= 1) {
    const angle = (-2 * Math.PI) / len;
    const wr = Math.cos(angle);
    const wi = Math.sin(angle);
    for (let i = 0; i < FFT; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const next = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = next;
      }
    }
  }
  const out = new Float32Array(FFT / 2);
  for (let i = 0; i < FFT / 2; i++) out[i] = re[i] * re[i] + im[i] * im[i];
  return out;
}

/**
 * Son à 16 kHz (-1 à 1) → tranches de 80 bandes, moyenne retirée (comme à
 * l'entraînement de WeSpeaker). Renvoie le nombre de tranches et les valeurs à plat.
 */
export function fbank(samples: Float32Array): { frames: number; data: Float32Array } {
  const frames = samples.length < FRAME ? 0 : 1 + Math.floor((samples.length - FRAME) / SHIFT);
  const data = new Float32Array(frames * MELS);
  const win = povey();
  const filters = melBanks();
  const buf = new Float32Array(FRAME);
  for (let t = 0; t < frames; t++) {
    let mean = 0;
    for (let i = 0; i < FRAME; i++) {
      buf[i] = samples[t * SHIFT + i] * 32768;
      mean += buf[i];
    }
    mean /= FRAME;
    for (let i = 0; i < FRAME; i++) buf[i] -= mean;
    for (let i = FRAME - 1; i > 0; i--) buf[i] -= 0.97 * buf[i - 1];
    buf[0] -= 0.97 * buf[0];
    for (let i = 0; i < FRAME; i++) buf[i] *= win[i];
    const spectrum = power(buf);
    for (let m = 0; m < MELS; m++) {
      const { start, weights } = filters[m];
      let sum = 0;
      for (let k = 0; k < weights.length; k++) sum += weights[k] * spectrum[start + k];
      data[t * MELS + m] = Math.log(Math.max(sum, EPS));
    }
  }
  for (let m = 0; m < MELS; m++) {
    let mean = 0;
    for (let t = 0; t < frames; t++) mean += data[t * MELS + m];
    mean /= frames || 1;
    for (let t = 0; t < frames; t++) data[t * MELS + m] -= mean;
  }
  return { frames, data };
}

/** Cosinus entre deux empreintes : 1 = identiques, 0 = sans rapport. */
export function similarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Empreinte ramenée à une longueur de 1 (la moyenne de plusieurs phrases reste comparable). */
export function normalize(v: ArrayLike<number>): number[] {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  return Array.from(v, (x) => x / n);
}

/** Moyenne de plusieurs empreintes (inscription : trois phrases). */
export function average(prints: ArrayLike<number>[]): number[] {
  const size = prints[0]?.length ?? 0;
  const sum = new Array<number>(size).fill(0);
  for (const p of prints) {
    const unit = normalize(p);
    for (let i = 0; i < size; i++) sum[i] += unit[i];
  }
  return normalize(sum);
}

export type VoicePrinter = (samples: Float32Array) => Promise<number[] | null>;

type OrtModule = typeof Ort;

export async function createPrinter(ort: OrtModule, model: string | Uint8Array): Promise<VoicePrinter> {
  const session = await ort.InferenceSession.create(model as Uint8Array);
  return async (samples) => {
    if (samples.length < MIN_SAMPLES) return null;
    const { frames, data } = fbank(samples);
    const out = await session.run({ feats: new ort.Tensor("float32", data, [1, frames, MELS]) });
    return normalize((out.embs as Ort.Tensor).data as Float32Array);
  };
}

let loading: Promise<VoicePrinter | null> | null = null;

/** Navigateur : charge le modèle une fois (≈ 6,7 Mo, gardé en cache ensuite). Null si l'appareil ne peut pas. */
export function loadPrinter(): Promise<VoicePrinter | null> {
  loading ??= (async () => {
    try {
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.wasmPaths = ortWasmPath(ort);
      ort.env.wasm.numThreads = 1;
      return await createPrinter(ort, "/voiceprint/resnet34.onnx");
    } catch {
      loading = null;
      return null;
    }
  })();
  return loading;
}

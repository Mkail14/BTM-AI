/**
 * Silero VAD : reconnaît une voix humaine (et pas seulement un son fort).
 * Sert à la porte à bruit du mode « sans bouton » : une moto ou des travaux
 * ne passent plus pour de la parole. Modèle libre (MIT) de snakers4/silero-vad,
 * exécuté dans le navigateur par onnxruntime-web.
 *
 * Fichiers servis par le site dans /vad/ (moteur dans /vad/ort/<version>/, copié par scripts/copy-vad.mjs) :
 * le modèle (~2,3 Mo) et le moteur (~15 Mo, ~4 Mo compressé), gardés en cache ensuite.
 */

import type * as Ort from "onnxruntime-web";
import { ortWasmPath } from "./ort-path";

/** Silero travaille par tranches de 512 échantillons à 16 kHz (32 ms), avec les 64 d'avant. */
const FRAME = 512;
const CONTEXT = 64;

/** Renvoie, pour un paquet de son à 16 kHz, la plus forte probabilité de voix (0 à 1). */
export type VoiceDetector = (samples: Float32Array) => Promise<number>;

type OrtModule = typeof Ort;

export async function createSilero(ort: OrtModule, model: string | Uint8Array): Promise<VoiceDetector> {
  const session = await ort.InferenceSession.create(model as Uint8Array);
  const sr = new ort.Tensor("int64", BigInt64Array.from([BigInt(16000)]), []);
  let state: Ort.Tensor = new ort.Tensor("float32", new Float32Array(2 * 128), [2, 1, 128]);
  let context = new Float32Array(CONTEXT);
  let rest = new Float32Array(0);

  const frame = async (samples: Float32Array) => {
    const input = new Float32Array(CONTEXT + FRAME);
    input.set(context);
    input.set(samples, CONTEXT);
    context = samples.slice(FRAME - CONTEXT);
    const out = await session.run({ input: new ort.Tensor("float32", input, [1, CONTEXT + FRAME]), state, sr });
    state = out.stateN as Ort.Tensor;
    return (out.output as Ort.Tensor).data[0] as number;
  };

  // Les paquets ne tombent pas juste sur 512 : le reste attend le paquet suivant.
  return async (samples) => {
    const all = new Float32Array(rest.length + samples.length);
    all.set(rest);
    all.set(samples, rest.length);
    let best = 0;
    let at = 0;
    for (; at + FRAME <= all.length; at += FRAME) best = Math.max(best, await frame(all.subarray(at, at + FRAME)));
    rest = all.slice(at);
    return best;
  };
}

/** Navigateur : charge Silero en arrière-plan. Renvoie null si l'appareil ne peut pas (la porte au volume reste alors seule). */
export async function loadSilero(): Promise<VoiceDetector | null> {
  try {
    const ort = await import("onnxruntime-web/wasm");
    ort.env.wasm.wasmPaths = ortWasmPath(ort);
    // Plusieurs fils demandent une isolation de page que le site n'a pas : un seul suffit (≈ 1 ms par tranche).
    ort.env.wasm.numThreads = 1;
    return await createSilero(ort, "/vad/silero_vad.onnx");
  } catch {
    return null;
  }
}

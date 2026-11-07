/**
 * Enregistre une phrase au micro pour inscrire la voix (paramètres). Mêmes
 * réglages que le vocal en direct (session.ts) : réduction de bruit du
 * téléphone, filtre des bruits graves, son ramené à 16 kHz par moyenne. Le son
 * reste dans la page : seule son empreinte est envoyée.
 */

const WORKLET = `
class VoiceprintCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = []; this.ratio = sampleRate / 16000; this.pos = 0; this.sum = 0; this.count = 0; }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i]; this.count += 1; this.pos += 1;
      if (this.pos >= this.ratio) { this.pos -= this.ratio; this.buffer.push(this.sum / this.count); this.sum = 0; this.count = 0; }
    }
    if (this.buffer.length >= 800) { this.port.postMessage(Float32Array.from(this.buffer)); this.buffer = []; }
    return true;
  }
}
registerProcessor("voiceprint-capture", VoiceprintCapture);
`;

const RATE = 16000;
/** Tranche de 30 ms pour repérer la parole au volume. */
const SLICE = 480;
/** Assez bas pour une voix douce (le modèle ne dépend pas du volume). */
const SPEECH_RMS = 0.008;

export type Recording = { stop: () => Promise<Float32Array> };

/** Ouvre le micro ; `onLevel` reçoit le volume (0 à 1) pour la jauge. À appeler au toucher (iPhone). */
export async function startRecording(onLevel: (level: number) => void, maxMs = 10_000): Promise<Recording> {
  const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const audio = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
  await audio.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const node = new AudioWorkletNode(audio, "voiceprint-capture");
  const lowCut = audio.createBiquadFilter();
  lowCut.type = "highpass";
  lowCut.frequency.value = 120;
  audio.createMediaStreamSource(mic).connect(lowCut).connect(node);
  const chunks: Float32Array[] = [];
  let length = 0;
  let done: ((samples: Float32Array) => void) | null = null;
  const result = new Promise<Float32Array>((resolve) => (done = resolve));

  const close = () => {
    if (!done) return;
    const finish = done;
    done = null;
    node.port.onmessage = null;
    mic.getTracks().forEach((t) => t.stop());
    void audio.close().catch(() => null);
    const all = new Float32Array(length);
    let at = 0;
    for (const chunk of chunks) {
      all.set(chunk, at);
      at += chunk.length;
    }
    finish(trimSilence(all));
  };

  node.port.onmessage = (event: MessageEvent<Float32Array>) => {
    chunks.push(event.data);
    length += event.data.length;
    let sum = 0;
    for (const v of event.data) sum += v * v;
    onLevel(Math.min(1, Math.sqrt(sum / event.data.length) * 8));
    if (length >= (maxMs / 1000) * RATE) close();
  };
  const timer = setTimeout(close, maxMs + 500);
  return {
    stop: () => {
      clearTimeout(timer);
      close();
      return result;
    },
  };
}

/** Retire le silence du début et de la fin (on garde 0,2 s de marge). */
export function trimSilence(samples: Float32Array): Float32Array {
  const loud = (slice: number) => {
    let sum = 0;
    for (let i = slice * SLICE; i < Math.min((slice + 1) * SLICE, samples.length); i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / SLICE) > SPEECH_RMS;
  };
  const slices = Math.floor(samples.length / SLICE);
  let first = 0;
  while (first < slices && !loud(first)) first++;
  let last = slices - 1;
  while (last > first && !loud(last)) last--;
  if (first >= slices) return new Float32Array(0);
  const margin = Math.round(0.2 * RATE);
  return samples.slice(Math.max(0, first * SLICE - margin), Math.min(samples.length, (last + 1) * SLICE + margin));
}

/** Durée de parole réelle (tranches au-dessus du seuil), en secondes. */
export function speechSeconds(samples: Float32Array): number {
  let count = 0;
  for (let at = 0; at + SLICE <= samples.length; at += SLICE) {
    let sum = 0;
    for (let i = at; i < at + SLICE; i++) sum += samples[i] * samples[i];
    if (Math.sqrt(sum / SLICE) > SPEECH_RMS) count++;
  }
  return (count * SLICE) / RATE;
}

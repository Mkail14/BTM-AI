import "server-only";
import { loadAIChain } from "../registry";
import { errorFromStatus } from "../providers/openai-compatible";
import { geminiHeaders, geminiRoot, isGeminiUrl, listKeyModels } from "../providers/gemini";
import { AIProviderError } from "../types";
import type { GeminiVoiceId } from "./voices";

/**
 * Voix de Tamilya par la synthèse vocale de Gemini, avec la clé Gemini déjà
 * utilisée pour ses réponses (pas d'autre abonnement). Renvoie un fichier MP3.
 */

/** Modèles de voix connus, du plus rapide au plus soigné (si la liste des modèles de la clé est illisible). */
const KNOWN_TTS_MODELS = ["gemini-2.5-flash-preview-tts", "gemini-2.5-pro-preview-tts"];
const TIMEOUT_MS = 30_000;
/** Un modèle sans quota est mis de côté ce temps-là. */
const RESTING_MS = 10 * 60_000;
const resting = new Map<string, number>();

// Pas de consigne de style : Gemini la lit à voix haute avec le texte (vérifié). La voix choisie donne le ton.

async function geminiKey(): Promise<{ apiKey: string; baseUrl: string | undefined }> {
  const chain = await loadAIChain();
  for (const slot of chain) {
    if (slot.result.ok && isGeminiUrl(slot.result.config.baseUrl)) {
      return { apiKey: slot.result.config.apiKey, baseUrl: slot.result.config.baseUrl };
    }
  }
  throw new AIProviderError("unavailable", "Aucune clé Gemini dans la chaîne d'API (/admin/circuit).");
}

/** Modèles de voix de la clé : « flash » avant « pro », les plus récents d'abord. */
export function ttsModels(available: readonly string[]): string[] {
  const found = available.filter((id) => /^gemini-[\d.]+-.*tts/.test(id));
  if (!found.length) return KNOWN_TTS_MODELS;
  const version = (id: string) => Number(id.match(/^gemini-([\d.]+)/)?.[1] ?? 0);
  return found.sort((a, b) => Number(/pro/.test(a)) - Number(/pro/.test(b)) || version(b) - version(a));
}

/** Morceaux de son de 20 ms : parole (true) ou silence (false). */
function speechWindows(samples: Int16Array, size: number): boolean[] {
  const windows: boolean[] = [];
  for (let i = 0; i < samples.length; i += size) {
    let sum = 0;
    const end = Math.min(samples.length, i + size);
    for (let j = i; j < end; j++) sum += samples[j] * samples[j];
    windows.push(Math.sqrt(sum / (end - i)) > 400);
  }
  return windows;
}

/**
 * Gemini laisse souvent un petit bruit isolé (grésillement) au tout début et à
 * la toute fin du son, séparé de la parole par un silence. On le coupe, on
 * retire les silences des bords (en gardant un peu d'air) et on fond l'entrée
 * et la sortie pour éviter le « clic ».
 */
export function cleanSpeech(samples: Int16Array, rate: number): Int16Array {
  const size = Math.round(rate / 50);
  const windows = speechWindows(samples, size);
  // Plages de parole [début, fin[ en fenêtres.
  const runs: [number, number][] = [];
  windows.forEach((on, i) => {
    if (!on) return;
    const last = runs.at(-1);
    if (last && last[1] === i) last[1] = i + 1;
    else runs.push([i, i + 1]);
  });
  if (!runs.length) return samples;
  const ms = (n: number) => n * 20;
  // Bruit du début : court (≤ 120 ms), suivi d'un silence d'au moins 100 ms.
  while (runs.length > 1 && ms(runs[0][1] - runs[0][0]) <= 120 && ms(runs[1][0] - runs[0][1]) >= 100) runs.shift();
  // Bruit de la fin : court (≤ 260 ms), après un silence d'au moins 200 ms.
  while (runs.length > 1) {
    const [last, before] = [runs.at(-1)!, runs.at(-2)!];
    if (ms(last[1] - last[0]) > 260 || ms(last[0] - before[1]) < 200) break;
    runs.pop();
  }
  const margin = 4; // 80 ms d'air autour de la parole
  const start = Math.max(0, (runs[0][0] - margin) * size);
  const end = Math.min(samples.length, (runs.at(-1)![1] + margin) * size);
  const out = samples.slice(start, end);
  const fade = Math.min(Math.round(rate * 0.03), Math.floor(out.length / 2));
  for (let i = 0; i < fade; i++) {
    out[i] = Math.round((out[i] * i) / fade);
    out[out.length - 1 - i] = Math.round((out[out.length - 1 - i] * i) / fade);
  }
  return out;
}

/**
 * Son brut de Gemini (PCM 16 bits, mono) en MP3 48 kb/s : 8 fois plus léger que
 * le WAV. À Mayotte, le téléchargement depuis le serveur (Irlande) prenait plus
 * de temps que Gemini lui-même.
 */
export async function pcmToMp3(samples: Int16Array, sampleRate = 24_000, kbps = 48): Promise<Uint8Array> {
  // Import dynamique : le paquet n'exporte l'encodeur que dans sa version ES (pas avec require).
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(1, sampleRate, kbps);
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += 1152 * 20) chunks.push(encoder.encodeBuffer(samples.subarray(i, i + 1152 * 20)));
  chunks.push(encoder.flush());
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** En-tête WAV autour du son (PCM 16 bits, mono). */
export function toWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const pcm = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

/**
 * Format du son renvoyé : MP3 (par défaut), ou pour comparer à l'oreille
 * (relais seulement) : WAV nettoyé, WAV brut tel que Gemini l'envoie, MP3 de meilleure qualité.
 */
export type SpeechFormat = "mp3" | "mp3-hq" | "wav" | "wav-raw";

export type Speech = { audio: Uint8Array; contentType: string; trace: string };

async function encode(pcm: Uint8Array, rate: number, format: SpeechFormat): Promise<Omit<Speech, "trace">> {
  const samples = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + (pcm.byteLength & ~1)));
  if (format === "wav-raw") return { audio: toWav(samples, rate), contentType: "audio/wav" };
  const clean = cleanSpeech(samples, rate);
  if (format === "wav") return { audio: toWav(clean, rate), contentType: "audio/wav" };
  return { audio: await pcmToMp3(clean, rate, format === "mp3-hq" ? 96 : 48), contentType: "audio/mpeg" };
}

type TtsResponse = { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };

/** Son de la voix, et le trajet (modèles essayés, statut, durée) pour l’en-tête x-voice-trace. */
export async function synthesizeSpeech(text: string, voice: GeminiVoiceId, signal: AbortSignal, format: SpeechFormat = "mp3"): Promise<Speech> {
  const started = Date.now();
  const trace: string[] = [];
  const key = await geminiKey();
  const combined = AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]);
  const models = ttsModels(await listKeyModels(key, combined));
  const restKey = (model: string) => `${key.apiKey.slice(-8)}:${model}`;
  const ordered = [...models.filter((m) => (resting.get(restKey(m)) ?? 0) < Date.now()), ...models];
  let lastError: AIProviderError | null = null;

  trace.push(`liste:${Date.now() - started}ms`);
  for (const model of [...new Set(ordered)].slice(0, 3)) {
    const at = Date.now();
    const response = await fetch(`${geminiRoot(key.baseUrl)}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: geminiHeaders(key.apiKey),
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
      signal: combined,
    }).catch((error: unknown) => {
      if (signal.aborted) throw new AIProviderError("aborted", "Lecture annulée", { cause: error });
      throw new AIProviderError("unavailable", "Connexion à Gemini impossible", { cause: error });
    });

    trace.push(`${model}:${response.status}:${Date.now() - at}ms`);
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      lastError = errorFromStatus(response.status, body);
      // Sans quota, introuvable ou surchargé : on essaie le modèle de voix suivant.
      if (response.status === 429 || response.status === 404 || response.status >= 500) {
        resting.set(restKey(model), Date.now() + RESTING_MS);
        continue;
      }
      throw lastError;
    }

    const json = (await response.json()) as TtsResponse;
    // Le son peut arriver en plusieurs morceaux : on les met bout à bout.
    const parts = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.inlineData).filter((d) => d?.data);
    if (!parts.length) {
      lastError = new AIProviderError("unavailable", `Gemini « ${model} » n'a pas renvoyé de son`);
      continue;
    }
    const rate = Number(parts[0]?.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24_000);
    const pcm = Buffer.concat(parts.map((d) => Buffer.from(d!.data!, "base64")));
    trace.push(`morceaux:${parts.length}`);
    return { ...(await encode(pcm, rate, format)), trace: trace.join(" ") };
  }
  throw lastError ?? new AIProviderError("quota", "Aucun modèle de voix Gemini disponible pour cette clé.");
}

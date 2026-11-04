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

/**
 * Son brut de Gemini (PCM 16 bits, mono) en MP3 48 kb/s : 8 fois plus léger que
 * le WAV. À Mayotte, le téléchargement depuis le serveur (Irlande) prenait plus
 * de temps que Gemini lui-même.
 */
export async function pcmToMp3(pcm: Uint8Array, sampleRate = 24_000): Promise<Uint8Array> {
  // Import dynamique : le paquet n'exporte l'encodeur que dans sa version ES (pas avec require).
  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const samples = new Int16Array(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + (pcm.byteLength & ~1)));
  const encoder = new Mp3Encoder(1, sampleRate, 48);
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

type TtsResponse = { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };

/** Son MP3, et le trajet (modèles essayés, statut, durée) pour l’en-tête x-voice-trace. */
export async function synthesizeSpeech(text: string, voice: GeminiVoiceId, signal: AbortSignal): Promise<{ audio: Uint8Array; trace: string }> {
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
    const audio = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!audio?.data) {
      lastError = new AIProviderError("unavailable", `Gemini « ${model} » n'a pas renvoyé de son`);
      continue;
    }
    const rate = Number(audio.mimeType?.match(/rate=(\d+)/)?.[1] ?? 24_000);
    return { audio: await pcmToMp3(Buffer.from(audio.data, "base64"), rate), trace: trace.join(" ") };
  }
  throw lastError ?? new AIProviderError("quota", "Aucun modèle de voix Gemini disponible pour cette clé.");
}

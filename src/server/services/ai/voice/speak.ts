import "server-only";
import { relaySpeech, relayUrl } from "@/server/services/ai/relay";
import { keysSecret } from "@/lib/ai/secret-box";
import { streamSpeech } from "@/server/services/ai/voice/stream-tts";
import type { GeminiVoiceId } from "@/lib/ai/voice/voices";

/**
 * Voix de Tamilya (Gemini) en MP3 continu, partagée par /api/voice/speak (site)
 * et /api/v1/tamilya/voice (API des développeurs) : même moteur, même nettoyage.
 * Ne rend la main qu'au premier son : une erreur arrive avant toute réponse.
 */
export async function speakAsTamilya(
  text: string,
  voice: GeminiVoiceId,
  signal: AbortSignal,
): Promise<{ stream: ReadableStream<Uint8Array> | null; firstAudioMs: number }> {
  const startedAt = Date.now();
  // Développement local : Google refuse Gemini depuis Mayotte, le site en ligne lit à la place.
  const relay = relayUrl();
  const secret = keysSecret();
  if (relay && secret) {
    const upstream = await relaySpeech(relay, secret, { text, voice }, signal);
    return { stream: upstream.body, firstAudioMs: Number(upstream.headers.get("x-voice-ms")) || Date.now() - startedAt };
  }
  const { stream, firstAudioMs } = await streamSpeech(text, voice, signal);
  return { stream, firstAudioMs };
}

/** Réponse audio : x-voice-ms = temps jusqu'au premier son sur le serveur (chronométrage, /admin/voix). */
export const speechResponse = ({ stream, firstAudioMs }: { stream: ReadableStream<Uint8Array> | null; firstAudioMs: number }) =>
  new Response(stream, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "x-voice-ms": String(firstAudioMs) },
  });

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIProviderError } from "@/lib/ai";
import { relayEnabled, verifyRelay } from "@/lib/ai/relay";
import { keysSecret } from "@/lib/ai/secret-box";
import { synthesizeSpeech } from "@/lib/ai/voice/gemini-tts";
import { streamSpeech } from "@/lib/ai/voice/stream-tts";
import { isGeminiVoice, SPEECH_MAX_CHARS, type GeminiVoiceId } from "@/lib/ai/voice/voices";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";

/**
 * Relais de la voix pour le développement local (Google refuse Gemini depuis
 * Mayotte) : même signature et même ouverture (RELAY_ENABLED=1) que /api/ai/relay.
 * Réponse : le fichier MP3.
 */

export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(SPEECH_MAX_CHARS),
  voice: z.string().refine(isGeminiVoice),
  // Pour comparer les formats à l'oreille depuis un poste de l'équipe.
  format: z.enum(["mp3", "mp3-hq", "wav", "wav-raw"]).optional(),
});

export async function POST(request: NextRequest) {
  if (!relayEnabled()) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

  const raw = await request.text();
  if (raw.length > SPEECH_MAX_CHARS * 4) return NextResponse.json({ error: "Demande trop lourde." }, { status: 413 });
  const signed = verifyRelay(raw, request.headers.get("x-relay-time"), request.headers.get("x-relay-signature"), keysSecret() ?? undefined);
  if (!signed) return NextResponse.json({ error: "Relais refusé." }, { status: 401 });

  try {
    const limit = await consumeRateLimits([{ key: "ai-relay", rules: RATE_LIMIT_POLICIES.aiRelay }]);
    if (!limit.allowed) return NextResponse.json({ error: "Trop de demandes." }, { status: 429 });
  } catch (error) {
    console.error("[relais voix] Compteurs indisponibles", error);
    return NextResponse.json({ error: "Relais indisponible." }, { status: 503 });
  }

  let parsed;
  try {
    parsed = bodySchema.safeParse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  }
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });

  try {
    // Formats de test (comparaison à l'oreille) : son entier. Sinon : MP3 en continu, comme sur le site.
    if (parsed.data.format) {
      const { audio, contentType, trace } = await synthesizeSpeech(parsed.data.text, parsed.data.voice as GeminiVoiceId, request.signal, parsed.data.format);
      return new Response(audio as BodyInit, { headers: { "Content-Type": contentType, "Cache-Control": "no-store", "x-voice-trace": trace } });
    }
    const { stream, firstAudioMs, trace } = await streamSpeech(parsed.data.text, parsed.data.voice as GeminiVoiceId, request.signal);
    return new Response(stream, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store", "x-voice-trace": trace, "x-voice-ms": String(firstAudioMs) },
    });
  } catch (error) {
    console.error("[relais voix] Lecture impossible", error);
    const code = error instanceof AIProviderError ? error.code : "unavailable";
    return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 200) : "Erreur", code }, { status: 502 });
  }
}

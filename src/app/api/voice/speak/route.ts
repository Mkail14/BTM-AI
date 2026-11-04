import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIProviderError } from "@/lib/ai";
import { relaySpeech, relayUrl } from "@/lib/ai/relay";
import { keysSecret } from "@/lib/ai/secret-box";
import { synthesizeSpeech } from "@/lib/ai/voice/gemini-tts";
import { loadVoice } from "@/lib/ai/voice/settings";
import { isGeminiVoice, SPEECH_MAX_CHARS, type GeminiVoiceId } from "@/lib/ai/voice/voices";
import { getAuthContext } from "@/lib/auth/session";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";

/**
 * Voix de Tamilya (Gemini) : le texte d'une réponse → un fichier WAV. Comptes
 * connectés seulement ; `voice` (essai d'une autre voix) réservé aux admins.
 * En cas d'échec, le navigateur reprend sa propre voix.
 */

export const maxDuration = 60;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(SPEECH_MAX_CHARS),
  voice: z.string().refine(isGeminiVoice).optional(),
});

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { user } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });

  try {
    const limit = await consumeRateLimits([{ key: `voice:${user.id}`, rules: RATE_LIMIT_POLICIES.voiceSpeak }]);
    if (!limit.allowed) return NextResponse.json({ error: "Trop de lectures, réessaie dans un instant." }, { status: 429 });
  } catch (error) {
    console.error("[voix] Compteurs indisponibles", error);
    return NextResponse.json({ error: "Voix indisponible." }, { status: 503 });
  }

  const voice: GeminiVoiceId = user.isAdmin && parsed.data.voice ? (parsed.data.voice as GeminiVoiceId) : await loadVoice();
  try {
    // Développement local : Google refuse Gemini depuis Mayotte, le site en ligne lit à la place.
    const relay = relayUrl();
    const secret = keysSecret();
    const wav =
      relay && secret
        ? await relaySpeech(relay, secret, { text: parsed.data.text, voice }, request.signal)
        : await synthesizeSpeech(parsed.data.text, voice, request.signal);
    return new Response(wav as BodyInit, { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AIProviderError && error.code === "aborted") return new Response(null, { status: 499 });
    console.error("[voix] Lecture impossible", error);
    const message = error instanceof Error ? error.message.slice(0, 300) : "Voix indisponible.";
    return NextResponse.json({ error: user.isAdmin ? message : "Voix indisponible." }, { status: 502 });
  }
}

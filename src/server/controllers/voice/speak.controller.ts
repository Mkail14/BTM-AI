import { canUse } from "@/server/services/site/features";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AIProviderError } from "@/server/services/ai";
import { speakAsTamilya, speechResponse } from "@/server/services/ai/voice/speak";
import { loadVoice } from "@/server/services/ai/voice/settings";
import { isGeminiVoice, SPEECH_MAX_CHARS, type GeminiVoiceId } from "@/lib/ai/voice/voices";
import { getAuthContext } from "@/server/middlewares/session";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/server/middlewares/rate-limit";
import { isSameOrigin } from "@/server/middlewares/request";

/**
 * Voix de Tamilya (Gemini) : le texte d'une réponse → un fichier MP3. Comptes
 * connectés seulement ; `voice` (essai d'une autre voix) réservé aux admins.
 * En cas d'échec, le navigateur reprend sa propre voix.
 */

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

  // Voix d'un personnage : histoires des administrateurs, et livres quand ils sont ouverts à tous (/admin/fonctionnalites).
  const voices = Boolean(parsed.data.voice) && (user.isAdmin || (await canUse(user, "livres")));
  const voice: GeminiVoiceId = voices ? (parsed.data.voice as GeminiVoiceId) : await loadVoice();
  try {
    // Son en continu : la réponse part dès le premier morceau de voix de Gemini.
    return speechResponse(await speakAsTamilya(parsed.data.text, voice, request.signal));
  } catch (error) {
    if (error instanceof AIProviderError && error.code === "aborted") return new Response(null, { status: 499 });
    console.error("[voix] Lecture impossible", error);
    const message = error instanceof Error ? error.message.slice(0, 300) : "Voix indisponible.";
    return NextResponse.json({ error: user.isAdmin ? message : "Voix indisponible." }, { status: 502 });
  }
}

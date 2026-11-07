import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { lyriaPrompt, parseSongSpec } from "@/lib/music/intent";
import { generateSong, LyriaError } from "@/lib/music/lyria";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";

/** Lyria compose un extrait de 30 s : bien moins d'une minute, avec de la marge. */
export const maxDuration = 120;

const bodySchema = z.object({ spec: z.string().min(1).max(2_000) });

/**
 * Chanson demandée à Tamilya : les paroles écrites par Tamilya (bloc ```chanson```) deviennent
 * une chanson chantée avec des instruments (Lyria). Comptes connectés ; chaque chanson coûte,
 * d'où la limite par jour. Renvoie le son (MP3).
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { user } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Connecte-toi pour m'entendre chanter.", reason: "login" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const spec = parsed.success ? parseSongSpec(parsed.data.spec) : null;
  if (!spec) return NextResponse.json({ error: "Ces paroles ne peuvent pas être chantées." }, { status: 400 });

  const rules = user.isAdmin ? RATE_LIMIT_POLICIES.musicAdmin : RATE_LIMIT_POLICIES.music;
  const limit = await consumeRateLimits([{ key: `music:${user.id}`, rules }]).catch(() => null);
  if (!limit?.allowed) return NextResponse.json({ error: "J'ai assez chanté pour aujourd'hui : redemande-moi demain.", reason: "limit" }, { status: 429 });

  try {
    const song = await generateSong(lyriaPrompt(spec), "clip");
    return new NextResponse(new Uint8Array(song.audio), {
      headers: { "Content-Type": song.mimeType, "Cache-Control": "private, max-age=86400" },
    });
  } catch (error) {
    const status = error instanceof LyriaError ? error.status : 502;
    console.error("[chanson] Lyria", status, error instanceof Error ? error.message : "inconnue");
    // Refus de contenu (chanson trop proche d'une existante…) ou panne : on le dit simplement.
    const refused = status === 400 || status === 403;
    return NextResponse.json(
      { error: refused ? "Je n'arrive pas à chanter celle-là : demande-m'en une autre." : "Ma voix chantée ne répond pas : réessaie dans un instant." },
      { status: refused ? 422 : 502 },
    );
  }
}

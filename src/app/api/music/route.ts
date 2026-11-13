import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { canUse } from "@/lib/site/features";
import { lyriaPrompt, parseSongSpec, SONG_RETRY_STYLES } from "@/lib/music/intent";
import { bestLyrics } from "@/lib/music/lyricist";
import { generateSong, LyriaError } from "@/lib/music/lyria";
import { logSongRefusal } from "@/lib/music/refusals";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";

/** Parolier (7 s au plus) puis Lyria, qui compose un extrait de 30 s : bien moins d'une minute, avec de la marge. */
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
  if (!(await canUse(user, "chanson"))) return NextResponse.json({ error: "Les chansons ne sont pas ouvertes pour l'instant." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  const written = parsed.success ? parseSongSpec(parsed.data.spec) : null;
  if (!written) return NextResponse.json({ error: "Ces paroles ne peuvent pas être chantées." }, { status: 400 });

  const rules = user.isAdmin ? RATE_LIMIT_POLICIES.musicAdmin : RATE_LIMIT_POLICIES.music;
  const limit = await consumeRateLimits([{ key: `music:${user.id}`, rules }]).catch(() => null);
  if (!limit?.allowed) return NextResponse.json({ error: "J'ai assez chanté pour aujourd'hui : redemande-moi demain.", reason: "limit" }, { status: 429 });

  // Le parolier : deux réécritures par Flash en même temps, le code garde la meilleure des trois.
  const choice = await bestLyrics(written, request.signal);
  const spec = choice.spec;
  console.info("[chanson] Parolier", { version: choice.pick, ms: choice.ms, notes: choice.scores.map((s) => s.score) });

  // Google refuse parfois une chanson (trop proche d'une existante, filtre de contenu) : on
  // réessaie tout seul avec un style plus simple. Une seule chanson comptée dans la limite.
  const attempts = [spec, ...SONG_RETRY_STYLES.map((style) => ({ ...spec, style }))];
  const started = Date.now();
  let status = 502;
  for (const [index, attempt] of attempts.entries()) {
    try {
      const song = await generateSong(lyriaPrompt(attempt), "clip");
      return new NextResponse(new Uint8Array(song.audio), {
        headers: {
          "Content-Type": song.mimeType,
          "Cache-Control": "private, max-age=86400",
          // Paroles vraiment chantées (peut-être réécrites) : le globe les affiche à la place de celles de Tamilya.
          "X-Song-Lyrics": encodeURIComponent(spec.lyrics),
        },
      });
    } catch (error) {
      status = error instanceof LyriaError ? error.status : 502;
      const reason = error instanceof Error ? error.message : "inconnue";
      console.error("[chanson] Lyria", index + 1, status, reason);
      if (!isRefusal(status)) break; // panne : réessayer ne servirait à rien
      await logSongRefusal({ attempt: index + 1, status, reason, style: attempt.style, lyrics: attempt.lyrics });
      // Un refus arrive vite ; s'il a traîné, plus le temps d'un autre essai avant la coupure (120 s).
      if (Date.now() - started > RETRY_BEFORE_MS) break;
    }
  }
  return NextResponse.json(
    { error: isRefusal(status) ? "Je n'arrive pas à chanter celle-là : demande-m'en une autre." : "Ma voix chantée ne répond pas : réessaie dans un instant." },
    { status: isRefusal(status) ? 422 : 502 },
  );
}

/** Au-delà, pas de nouvel essai : une chanson prend jusqu'à ~50 s et la route est coupée à 120 s. */
const RETRY_BEFORE_MS = 45_000;

/** Refus de Google (et non panne) ; « pas de son » (422 de generateSong) compte aussi. */
const isRefusal = (status: number) => status === 400 || status === 403 || status === 422;

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { generateSong, LyriaError } from "@/lib/music/lyria";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";

/** Lyria peut mettre près de deux minutes pour une chanson entière. */
export const maxDuration = 120;

const bodySchema = z.object({
  prompt: z.string().trim().min(10).max(4_000),
  model: z.enum(["clip", "song"]).default("clip"),
});

/**
 * Essai des chansons de Tamilya (Lyria), réservé aux administrateurs : renvoie le son (MP3)
 * et, dans l'en-tête X-Lyria-Text (encodé), les paroles ou la structure que Lyria décrit.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { user } = await getAuthContext();
  if (!user?.isAdmin) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Décris la chanson en au moins 10 caractères." }, { status: 400 });

  const limit = await consumeRateLimits([{ key: `music:${user.id}`, rules: RATE_LIMIT_POLICIES.music }]).catch(() => null);
  if (!limit?.allowed) return NextResponse.json({ error: "Trop de chansons d'un coup : réessaie plus tard." }, { status: 429 });

  try {
    const song = await generateSong(parsed.data.prompt, parsed.data.model);
    return new NextResponse(new Uint8Array(song.audio), {
      headers: {
        "Content-Type": song.mimeType,
        "Cache-Control": "no-store",
        "X-Lyria-Model": song.model,
        "X-Lyria-Ms": String(song.ms),
        "X-Lyria-Text": encodeURIComponent(song.text.slice(0, 3_000)),
      },
    });
  } catch (error) {
    const status = error instanceof LyriaError ? error.status : 502;
    const message = error instanceof Error ? error.message : "inconnue";
    console.error("[musique] Lyria", status, message);
    return NextResponse.json({ error: `Lyria : ${message}` }, { status: status >= 400 && status < 600 ? status : 502 });
  }
}

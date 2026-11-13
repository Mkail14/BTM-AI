import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { canUse } from "@/lib/site/features";

/**
 * Miniature d'une vidéo proposée par Tamilya. Passe par notre serveur : l'appareil
 * de la personne ne contacte pas YouTube tant qu'elle n'ouvre pas la vidéo.
 *   ?v=ID      : miniature de cette vidéo ;
 *   ?q=mots    : miniature de la première vidéo trouvée pour cette recherche.
 */
const VIDEO_ID = /^[\w-]{11}$/;
const DAY = 60 * 60 * 24;

async function firstVideoId(query: string): Promise<string | null> {
  const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=fr`, {
    headers: { "accept-language": "fr-FR,fr;q=0.9", "user-agent": "Mozilla/5.0 (compatible; BTM-AI)" },
    next: { revalidate: DAY },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return null;
  const html = await res.text();
  return html.match(/"videoRenderer":\{"videoId":"([\w-]{11})"/)?.[1] ?? html.match(/"videoId":"([\w-]{11})"/)?.[1] ?? null;
}

export async function GET(request: NextRequest) {
  const { user } = await getAuthContext();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!(await canUse(user, "youtube"))) return new NextResponse(null, { status: 403 });

  const params = request.nextUrl.searchParams;
  const query = params.get("q")?.trim().slice(0, 200);
  let id = params.get("v");
  try {
    if (!id && query) id = await firstVideoId(query);
    if (!id || !VIDEO_ID.test(id)) return new NextResponse(null, { status: 404 });
    const image = await fetch(`https://i.ytimg.com/vi/${id}/mqdefault.jpg`, { next: { revalidate: DAY }, signal: AbortSignal.timeout(5000) });
    if (!image.ok) return new NextResponse(null, { status: 404 });
    return new NextResponse(await image.arrayBuffer(), {
      headers: { "content-type": "image/jpeg", "cache-control": `private, max-age=${DAY}` },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

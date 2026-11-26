import { NextResponse } from "next/server";
import { newsPlace, type Headline } from "@/lib/mayotte/news-place";
import { getMayotteNews, type NewsItem } from "@/server/services/live/news";

/** Nombre de « unes » qui tournent sur la page, et au plus combien par journal (pour varier). */
const MAX_HEADLINES = 12;
const MAX_PER_SOURCE = 4;

/** Les plus récents, sans doublon, en mélangeant les journaux. */
export function pickHeadlines(items: NewsItem[]): Headline[] {
  const seen = new Set<string>();
  const perSource = new Map<string, number>();
  const picked: Headline[] = [];
  for (const item of items) {
    const same = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const count = perSource.get(item.source) ?? 0;
    if (seen.has(item.link) || seen.has(same) || count >= MAX_PER_SOURCE) continue;
    seen.add(item.link).add(same);
    perSource.set(item.source, count + 1);
    picked.push({
      title: item.title,
      link: item.link,
      source: item.source,
      date: item.date,
      ...(item.image ? { image: item.image } : {}),
      place: newsPlace(item.title, item.summary),
    });
    if (picked.length >= MAX_HEADLINES) break;
  }
  return picked;
}

/**
 * GET /api/mayotte/une : les « unes » des journaux de Mayotte pour la page « Mayotte »,
 * avec le lieu dont parle chaque article (pour la carte). Lu directement dans les flux
 * RSS des journaux, sans IA. Données publiques, gardées 5 minutes.
 */
export async function GET() {
  const headlines = pickHeadlines(await getMayotteNews().catch(() => []));
  if (!headlines.length) return NextResponse.json({ headlines: [] }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ headlines }, { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" } });
}

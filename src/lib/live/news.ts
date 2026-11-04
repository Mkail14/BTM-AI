import "server-only";

/** Journaux de Mayotte qui publient un flux RSS public. */
export const NEWS_SOURCES = [
  { name: "Le Journal de Mayotte", url: "https://lejournaldemayotte.yt/feed/" },
  { name: "Mayotte Hebdo", url: "https://www.mayottehebdo.com/feed/" },
  { name: "L'info Kwézi", url: "https://www.linfokwezi.fr/feed/" },
] as const;

export type NewsItem = { source: string; title: string; link: string; date: string | null; summary: string };

const CACHE_MS = 15 * 60_000;
/** Même durée dans le cache de données de Next : partagé entre les instances du serveur, il survit aux redémarrages. */
const REVALIDATE_SECONDS = 900;
const FETCH_TIMEOUT_MS = 4_000;
let cache: { at: number; items: NewsItem[] } | null = null;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function clean(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(\w+);/g, (match, name: string) => ENTITIES[name] ?? match)
    .replace(/\[(?:…|\.\.\.)\]/g, "…")
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (item: string, name: string) => item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "";

/** Lecture minimale d'un flux RSS : titre, lien, date et résumé de chaque article. */
export function parseRss(xml: string, source: string): NewsItem[] {
  return [...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/g)].flatMap(([item]) => {
    const title = clean(tag(item, "title"));
    const link = clean(tag(item, "link"));
    if (!title || !/^https?:\/\//.test(link)) return [];
    const date = new Date(clean(tag(item, "pubDate")));
    return [
      {
        source,
        title,
        link,
        date: Number.isNaN(date.getTime()) ? null : date.toISOString(),
        summary: clean(tag(item, "description")).slice(0, 280),
      },
    ];
  });
}

async function readFeed(source: (typeof NEWS_SOURCES)[number]): Promise<NewsItem[]> {
  const response = await fetch(source.url, {
    headers: { "User-Agent": "BTM-AI/1.0 (+https://btm.yt)" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    // Seules les réponses 200 sont gardées : un journal en panne est réessayé au message suivant.
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!response.ok) throw new Error(`${source.name} : HTTP ${response.status}`);
  return parseRss(await response.text(), source.name);
}

/** Derniers articles des journaux de Mayotte, du plus récent au plus ancien (cache 15 min). */
export async function getMayotteNews(): Promise<NewsItem[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.items;
  const results = await Promise.allSettled(NEWS_SOURCES.map(readFeed));
  const items = results.flatMap((result) => {
    if (result.status === "fulfilled") return result.value;
    console.error("[actu] Flux illisible", result.reason);
    return [];
  });
  items.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  // Un échec complet n'est pas mis en cache : on réessaie au message suivant.
  if (items.length) cache = { at: Date.now(), items };
  return items;
}

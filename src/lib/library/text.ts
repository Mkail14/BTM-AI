/**
 * Bibliothèque Mayotte : préparation des textes (sans réseau ni base).
 * Page web → texte lisible → passages qui se chevauchent un peu, et niveau de
 * confiance d'après l'adresse de la source.
 */

export type LibraryTrust = "officiel" | "media" | "autre";

const CHUNK_CHARS = 1_200;
const OVERLAP_CHARS = 150;
export const MAX_DOCUMENT_CHARS = 200_000;

const OFFICIAL =
  /(^|\.)(gouv\.fr|service-public\.fr|insee\.fr|ameli\.fr|france-travail\.fr|caf\.fr|ars\.sante\.fr|chm-mayotte\.fr|ac-mayotte\.fr|cg976\.fr|departement976\.fr|mamoudzou\.yt)$/;
const MEDIA = /(^|\.)(franceinfo\.fr|mayottehebdo\.com|lejournaldemayotte\.yt|linfokwezi\.fr|lemonde\.fr|afp\.com)$/;

export function trustOf(url: string | null | undefined): LibraryTrust {
  if (!url) return "autre";
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (OFFICIAL.test(host)) return "officiel";
    if (MEDIA.test(host)) return "media";
  } catch {
    // Adresse illisible : confiance la plus basse.
  }
  return "autre";
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Texte lisible d'une page HTML : sans scripts, styles, menus ni pied de page. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "";
  const body = (html.match(/<main[\s\S]*?<\/main>/i)?.[0] ?? html.match(/<body[\s\S]*<\/body>/i)?.[0] ?? html)
    .replace(/<(script|style|noscript|svg|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)\s*>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&(\w+);/g, (match, name: string) => ENTITIES[name] ?? match);
  const text = body
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return { title, text };
}

/** Découpe en passages d'environ 1 200 caractères, coupés entre deux phrases, avec un léger chevauchement. */
export function chunkText(text: string): string[] {
  const clean = text.trim().slice(0, MAX_DOCUMENT_CHARS);
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + CHUNK_CHARS);
    if (end < clean.length) {
      const slice = clean.slice(start, end);
      const cut = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(". "));
      if (cut > CHUNK_CHARS / 2) end = start + cut + 1;
    }
    const chunk = clean.slice(start, end).trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    start = end - OVERLAP_CHARS;
  }
  return chunks;
}

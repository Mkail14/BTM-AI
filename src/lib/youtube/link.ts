/**
 * Liens YouTube proposés par Tamilya : affichés en carte, ils ouvrent l'app
 * YouTube (rien n'est lu dans BTM AI).
 */
export type YouTubeLink = { kind: "search"; query: string; url: string } | { kind: "video"; id: string; url: string };

const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const VIDEO_ID = /^[\w-]{11}$/;

export function parseYouTubeLink(href: string | undefined): YouTubeLink | null {
  if (!href) return null;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const query = url.searchParams.get("search_query")?.trim();
  if (url.pathname === "/results" && query) return { kind: "search", query, url: youtubeSearchUrl(query, url.searchParams.get("sp") === MOST_VIEWED) };
  const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/shorts\/([\w-]+)/)?.[1];
  if (id && VIDEO_ID.test(id)) return { kind: "video", id, url: `https://www.youtube.com/watch?v=${id}` };
  return null;
}

/** Filtre YouTube « trier par nombre de vues » (valeur du paramètre sp). */
const MOST_VIEWED = "CAM%3D";

/** Recherche YouTube ; `mostViewed` : les vidéos les plus vues d'abord. */
export const youtubeSearchUrl = (query: string, mostViewed = false) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${mostViewed ? `&sp=${encodeURIComponent(MOST_VIEWED)}` : ""}`;

/** Android : ouvre directement l'app YouTube, ou la page YouTube si l'app n'est pas installée. */
export function androidYouTubeIntent(url: string): string {
  const { host, pathname, search } = new URL(url);
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

const LINK_LINE = /^\s*(?:[-*+]|\d+[.)])?\s*\[[^\]\n]+\]\((\S+?)\)\s*$/;

/**
 * Lignes qui ne contiennent qu'une vidéo YouTube (puce ou numéro permis, lignes vides
 * entre elles) : réunies en un seul paragraphe, affiché en rangée qui défile vers la droite.
 */
export function groupYouTubeLines(text: string): string {
  const out: string[] = [];
  let run: string[] = [];
  let blanks: string[] = [];
  let fenced = false;
  const flush = () => {
    if (run.length) out.push(run.join(" "));
    out.push(...blanks);
    run = [];
    blanks = [];
  };
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const match = fenced ? null : line.match(LINK_LINE);
    if (match && parseYouTubeLink(match[1])) {
      run.push(line.replace(/^\s*(?:[-*+]|\d+[.)])?\s*/, "").trim());
      blanks = [];
    } else if (run.length && !line.trim()) {
      blanks.push(line);
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join("\n");
}

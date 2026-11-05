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
  if (url.pathname === "/results" && query) return { kind: "search", query, url: youtubeSearchUrl(query) };
  const id = url.hostname === "youtu.be" ? url.pathname.slice(1) : url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.match(/^\/shorts\/([\w-]+)/)?.[1];
  if (id && VIDEO_ID.test(id)) return { kind: "video", id, url: `https://www.youtube.com/watch?v=${id}` };
  return null;
}

export const youtubeSearchUrl = (query: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

/** Android : ouvre directement l'app YouTube, ou la page YouTube si l'app n'est pas installée. */
export function androidYouTubeIntent(url: string): string {
  const { host, pathname, search } = new URL(url);
  return `intent://${host}${pathname}${search}#Intent;scheme=https;package=com.google.android.youtube;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}

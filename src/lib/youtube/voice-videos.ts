import { youtubeSearchUrl } from "./link";

/** Recherches YouTube montrées à la fois : assez pour choisir, pas trop pour l'écran. */
export const MAX_VOICE_SEARCHES = 3;

/**
 * Vocal : Tamilya montre des vidéos au lieu d'en parler. Ses recherches deviennent des
 * liens YouTube, affichés en cartes dans la conversation (Markdown.tsx), comme à l'écrit.
 * Des recherches et pas des vidéos précises : une adresse de vidéo inventée mènerait nulle part.
 * Triées par nombre de vues : les plus vues d'abord, sans rien demander.
 */
export function voiceVideosBlock(searches: unknown): string | null {
  const list = (Array.isArray(searches) ? searches : typeof searches === "string" ? searches.split("|") : [])
    .map((s) => (typeof s === "string" ? s.replace(/[[\]()\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) : ""))
    .filter(Boolean);
  const unique = [...new Set(list)].slice(0, MAX_VOICE_SEARCHES);
  if (!unique.length) return null;
  return unique.map((query) => `[${query}](${youtubeSearchUrl(query, true)})`).join("\n");
}

/**
 * Chansons de Tamilya : la personne lui demande de chanter. Tamilya écrit des paroles
 * originales dans un bloc ```chanson```, que la conversation remplace par la carte
 * SongCard : Lyria (src/lib/music/lyria.ts) en fait la musique, et le globe chante.
 *
 * Format du bloc :
 *   style: chant de rue joyeux, chœur et violons, environ 130 BPM
 *   [Couplet]
 *   …
 *   [Refrain]
 *   …
 */

export const SONG_BLOCK = "chanson";

/** Longueurs maximales : un extrait de 30 s ne chante pas plus. */
export const SONG_LIMITS = { style: 300, lyrics: 1_200, lines: 24 } as const;

const normalize = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")} `;

const SING = /\b(?:chante|chantes|chantez|chanter|chantonne|chantonner|fredonne|fredonner)\b/;
const MAKE_SONG = /\b(?:fais|fait|faire|ecris|ecrire|compose|composer|invente|inventer|cree|creer|donne)(?: moi| nous| lui)? (?:une|un|une petite|un petit|une autre|ta|une nouvelle) (?:chanson|chansonnette|comptine|berceuse|chant|refrain)\b/;

/** La personne demande à Tamilya de chanter (« chante-moi quelque chose », « fais-moi une chanson »). */
export const detectSong = (message: string) => {
  const text = normalize(message);
  return SING.test(text) || MAKE_SONG.test(text);
};

export type SongSpec = { style: string; lyrics: string };

/** Lit le bloc : la ligne « style: » puis les paroles (balises [Couplet], [Refrain]…). Null si vide ou trop long. */
export function parseSongSpec(block: string): SongSpec | null {
  const lines = block.replace(/\r/g, "").split("\n").map((line) => line.trimEnd());
  let style = "";
  const lyrics: string[] = [];
  for (const line of lines) {
    const styleLine = /^\s*style\s*:\s*(.+)$/i.exec(line);
    if (styleLine && !style && lyrics.every((l) => !l.trim())) style = styleLine[1].trim();
    else lyrics.push(line);
  }
  const text = lyrics.join("\n").trim();
  const lineCount = text.split("\n").filter((l) => l.trim()).length;
  if (!text || text.length > SONG_LIMITS.lyrics || lineCount > SONG_LIMITS.lines || style.length > SONG_LIMITS.style) return null;
  return { style, lyrics: text };
}

/**
 * Style des nouveaux essais quand Google refuse : d'abord sans le style écrit par Tamilya (il
 * peut rappeler un morceau ou un artiste), puis un style très neutre.
 */
export const SONG_RETRY_STYLES = ["", "gentle original acoustic pop, guitar and light percussion, medium tempo"] as const;

/** Demande envoyée à Lyria : style, rappel « chanson originale », puis les paroles. */
export function lyriaPrompt(spec: SongSpec): string {
  return [
    `Original song${spec.style ? `: ${spec.style}` : ""}.`,
    "Sung by a warm, clear female lead voice, with real instruments. Do not imitate any existing song or artist.",
    "Sing exactly these lyrics, in their own language:",
    "",
    spec.lyrics,
  ].join("\n");
}

/**
 * Lecture en 3D : la personne demande à Tamilya de lui lire une page de livre. Tamilya répond à sa
 * façon et écrit le bloc ```lecture-3d```, que la conversation remplace par la carte ReadingCard :
 * photo de la page, mise en scène par Gemini (/api/lecture), voix des personnages et bruits placés
 * autour de la tête (src/lib/lecture/soundscape.ts).
 */

export const READING_BLOCK = "lecture-3d";

const normalize = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")} `;

const VERB = "(?:lis|lit|lisez|lire|relis|relire|raconte|raconter|joue|jouer)";
const WHO = "(?: moi| nous| lui)?";
const WHAT = "(?:une|cette|la|ma|un|ce|mon|des|les|mes|ces|une autre|la suite de|une page de|un passage de|cette page de)";
const THING = "(?:page|pages|livre|livres|passage|chapitre|extrait|conte|roman|bouquin)";
const ASK = new RegExp(`\\b${VERB}${WHO} ${WHAT}(?: \\w+)? ${THING}\\b`);
const NAMED = /\blecture (?:3d|immersive|en 3d)\b/;
/**
 * Un texte déjà là (« lis-moi ce message », « lis-moi cette histoire », « lis-moi ça ») :
 * jamais « raconte-moi une histoire », qui en demande une nouvelle.
 */
const READ_GIVEN =
  /\b(?:lis|lit|lisez|lire|relis|relire)(?: moi| nous| lui)? (?:(?:ce|cette|mon|ma|le|la|mes|ces|tout ce|tout le) (?:message|messages|texte|histoire|recit|poeme|conte|passage|page)|ca|cela)\b/;

/** « Lis-moi cette page », « lis-moi un livre », « lis-moi ce message », « lecture 3D ». */
export const detectReading = (message: string) => {
  const text = normalize(message);
  return ASK.test(text) || NAMED.test(text) || READ_GIVEN.test(text);
};

/** Texte lu sans photo : de quoi faire une vraie page, pas plus qu'une page (Gemini et les voix suivent). */
export const READING_TEXT = { min: 150, max: 6_000 } as const;

const FENCE = "```";

/**
 * Le texte à lire quand la personne l'a écrit ou collé : dans ce message (sans la phrase de
 * demande), sinon dans son message précédent. Null : pas de texte, elle prendra une photo.
 */
export function readingText(message: string, previous: string | null): string | null {
  const own = message
    .replace(/\r/g, "")
    .split("\n")
    .filter((line) => !(line.trim().length < 120 && detectReading(line)))
    .join("\n")
    .trim();
  for (const candidate of [own, previous?.trim() ?? ""]) {
    if (candidate.length >= READING_TEXT.min) return candidate.slice(0, READING_TEXT.max).replace(/`{3,}/g, "").trim();
  }
  return null;
}

/** Bloc de la carte : « page » (photo à prendre) ou « texte » puis le texte à lire. */
export const readingBlock = (text: string | null) => `\n\n${FENCE}${READING_BLOCK}\n${text ? `texte\n${text}` : "page"}\n${FENCE}`;

/** Met le texte dans le bloc écrit par Tamilya (elle n'a pas à le recopier), ou ajoute le bloc s'il manque. */
export function withReadingBlock(reply: string, text: string | null): string {
  const start = reply.indexOf(FENCE + READING_BLOCK);
  if (start < 0) return reply + readingBlock(text);
  const end = reply.indexOf(FENCE, start + FENCE.length + READING_BLOCK.length);
  const after = end < 0 ? "" : reply.slice(end + FENCE.length);
  return reply.slice(0, start).trimEnd() + readingBlock(text) + after;
}

/** Lit le bloc côté carte : le texte à lire, ou null (photo à prendre). */
export function parseReadingBlock(block: string): string | null {
  const body = block.replace(/\r/g, "").trim();
  if (!body.startsWith("texte")) return null;
  const text = body.slice("texte".length).trim();
  return text || null;
}

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

/** « Lis-moi cette page », « lis-moi un livre », « lecture 3D ». */
export const detectReading = (message: string) => {
  const text = normalize(message);
  return ASK.test(text) || NAMED.test(text);
};

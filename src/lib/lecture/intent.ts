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

/**
 * « Lis-moi » et ses fautes de frappe au téléphone, toujours suivies de « moi » ou « nous »
 * (« Los moi cette histoire », 2026-11-08 : la lecture ne s'était pas lancée).
 */
const TYPO = "(?:los|lus|li|lie|lies|lix|liz|lid|lia|kis|lsi)(?= (?:moi|nous))";
// « Je veux que tu me lise cette page » (2026-11-08) : subjonctif, souvent écrit sans accord.
const READ = `(?:lis|lit|lise|lises|lisent|lisez|lire|relis|relire|relise|${TYPO})`;
const VERB = `(?:${READ}|raconte|raconter|joue|jouer)`;
const WHO = "(?: moi| nous| lui)?";
const WHAT = "(?:une|cette|la|ma|un|ce|mon|des|les|mes|ces|une autre|la suite de|une page de|un passage de|cette page de)";
const THING = "(?:page|pages|livre|livres|passage|chapitre|extrait|conte|roman|bouquin)";
const ASK = new RegExp(`\\b${VERB}${WHO} ${WHAT}(?: \\w+)? ${THING}\\b`);
const NAMED = /\blecture (?:3d|immersive|en 3d)\b/;
/** « Je veux vivre la page », « fais-moi vivre cette histoire ». */
const LIVE = /\bvivre (?:la|cette|ma|une|l) (?:page|histoire|scene|lecture)\b/;
/**
 * Message court juste après un texte collé : « en vocal », « à voix haute », « avec les effets ».
 * Seul, il ne veut rien dire ; après une histoire, c'est la lecture de cette histoire.
 */
const FOLLOW =
  /\b(?:en vocal|en audio|a voix haute|a l oral|avec ta voix|en 3d|(?:lance|mets|demarre|fais) (?:la|ta) lecture|effets? speciaux|avec (?:les |des |tes )?(?:voix|bruits|effets|sons)|lis la|lis le|lise la|lise le|lis moi ca)\b/;
/**
 * Un texte déjà là (« lis-moi ce message », « lis-moi cette histoire », « lis-moi ça ») :
 * jamais « raconte-moi une histoire », qui en demande une nouvelle.
 */
const READ_GIVEN = new RegExp(
  `\\b${READ}(?: moi| nous| lui)? (?:(?:ce|cette|mon|ma|le|la|mes|ces|tout ce|tout le) (?:message|messages|texte|histoire|recit|poeme|conte|passage|page)|ca|cela)\\b`,
);

/** « Lis-moi cette page », « lis-moi un livre », « lis-moi ce message », « lecture 3D ». */
export const detectReading = (message: string) => {
  const text = normalize(message);
  return ASK.test(text) || NAMED.test(text) || LIVE.test(text) || READ_GIVEN.test(text);
};

/** Messages de la personne juste avant, le plus récent d'abord ; seuls les deux derniers comptent. */
type Previous = string | readonly string[] | null;
const recent = (previous: Previous): string[] =>
  previous === null ? [] : typeof previous === "string" ? [previous] : previous.slice(0, 2);

/** « En vocal », « avec les effets spéciaux » : court (8 mots au plus) et sans autre sujet. */
const isFollowUp = (message: string) => {
  const text = normalize(message).trim();
  return text.split(" ").length <= 8 && FOLLOW.test(` ${text} `);
};

/** Texte lu sans photo : de quoi faire une vraie page, pas plus qu'une page (Gemini et les voix suivent). */
export const READING_TEXT = { min: 150, max: 6_000 } as const;

/**
 * Lecture demandée dans ce message, ou demandée juste avant et le texte arrive maintenant
 * (« lis-moi cette histoire », puis l'histoire collée seule dans le message suivant).
 */
export function isReadingRequest(message: string, previous: Previous): boolean {
  if (detectReading(message)) return true;
  const before = recent(previous);
  const asked = before[0];
  if (asked && detectReading(asked) && asked.trim().length < READING_TEXT.min && message.trim().length >= READING_TEXT.min) return true;
  // Histoire collée, puis « en vocal » ou « avec les effets » (conte de Moya, 2026-11-08).
  return isFollowUp(message) && before.some((text) => text.trim().length >= READING_TEXT.min);
}

const FENCE = "```";

/**
 * Le texte à lire quand la personne l'a écrit ou collé : dans ce message (sans la phrase de
 * demande), sinon dans ses deux messages précédents. Null : pas de texte, elle prendra une photo.
 */
export function readingText(message: string, previous: Previous): string | null {
  for (const candidate of [message, ...recent(previous)].map(withoutAsk)) {
    if (candidate.length >= READING_TEXT.min) return candidate.slice(0, READING_TEXT.max).replace(/`{3,}/g, "").trim();
  }
  return null;
}

const OPEN_QUOTE = /["«“]/;

/**
 * Le texte sans la phrase de demande : une ligne courte qui demande la lecture est retirée ;
 * « … vivre la page "Page 1 : …" » garde ce qui suit le guillemet, sans le guillemet final.
 */
function withoutAsk(text: string): string {
  let quoted = false;
  const kept: string[] = [];
  for (const line of text.replace(/\r/g, "").split("\n")) {
    const quote = line.search(OPEN_QUOTE);
    if (!quoted && quote > 0 && detectReading(line.slice(0, quote))) {
      kept.push(line.slice(quote + 1));
      quoted = true;
    } else if (!(line.trim().length < 120 && detectReading(line))) kept.push(line);
  }
  const result = kept.join("\n").trim();
  return quoted ? result.replace(/["»”]$/, "").trim() : result;
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

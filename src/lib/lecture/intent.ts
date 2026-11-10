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
// Une image avec du texte aussi : capture d'écran, photo d'un message ou d'une affiche (demande du 2026-11-10).
const IMAGE = "image|images|photo|photos|capture|captures|screen|screenshot";
const THING = `(?:page|pages|livre|livres|passage|chapitre|extrait|conte|roman|bouquin|${IMAGE})`;
const ASK = new RegExp(`\\b${VERB}${WHO} ${WHAT}(?: \\w+)? ${THING}\\b`);
/** « Lis-moi ce qui est écrit sur cette capture », « ce qu'il y a sur la photo ». */
const ON_IMAGE = new RegExp(`\\b${READ}${WHO} (?:ce qui est ecrit|ce qu il y a(?: d ecrit)?|le texte) (?:sur|dans|de) (?:l|la|le|cette|ce|ma|mon|une|un) (?:${IMAGE})\\b`);
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
  // « teste », « txt » : fautes de frappe de « texte » (« Lis moi ce teste en 3d », 2026-11-08).
  // « Raconte cette histoire "…" » (2026-11-08) : raconter un texte donné, c'est le lire, pas en inventer un.
  `\\b(?:${READ}|raconte|racontes|raconter|racontez)(?: moi| nous| lui)? (?:(?:ce|cette|mon|ma|le|la|mes|ces|tout ce|tout le) (?:message|messages|texte|textes|teste|tests?|txt|histoire|recit|poeme|conte|passage|page|${IMAGE})|ca|cela)\\b`,
);
/**
 * Une histoire nouvelle, inventée par Tamilya (« lis-moi une histoire », « raconte-moi un conte »,
 * « invente une histoire de pêcheur ») : elle l'écrit et la joue en 3D, sans page ni photo.
 */
const STORY = new RegExp(
  `\\b(?:${READ}|raconte|racontes|raconter|racontez|invente|inventer|fais|fait|faire|cree|creer|ecris|ecrire|joue|jouer|dis|dire)(?: moi| nous| lui)?(?: (?:une|un|des|une petite|un petit|une autre|un autre|une belle|une nouvelle|une jolie|ton|ta|tes))? (?:histoire|histoires|conte|contes|legende|legendes|recit)\\b`,
);
/** La personne parle d'une vraie page ou d'une image (photo, capture) : sinon, sans texte donné, Tamilya invente l'histoire. */
const PAGE = new RegExp(`\\b(?:page|pages|livre|livres|bouquin|chapitre|roman|${IMAGE})\\b`);

export const detectStory = (message: string) => STORY.test(normalize(message));

/** « Lis-moi cette page », « lis-moi un livre », « lis-moi ce message », « lecture 3D ». */
export const detectReading = (message: string) => {
  const text = normalize(message);
  return ASK.test(text) || ON_IMAGE.test(text) || NAMED.test(text) || LIVE.test(text) || READ_GIVEN.test(text);
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

/**
 * Ce que la carte doit lire :
 * - texte : une histoire écrite ou collée par la personne, lue telle quelle ;
 * - histoire : une histoire inventée par Tamilya, d'après la demande (sujet, style) ;
 * - page : une vraie page de livre ou une image avec du texte, en photo ou en capture d'écran.
 * Demande de l'utilisateur (2026-11-08) : « je m'en fous de la page ; quand je dis lis-moi une
 * histoire, Tamilya la joue en 3D » : sans texte et sans parler de page, c'est une histoire inventée.
 */
export type ReadingMode = { kind: "texte"; text: string } | { kind: "histoire"; request: string } | { kind: "page" };

/** Demande telle que la personne l'a faite, sur une ligne, pour guider l'histoire inventée. */
const STORY_REQUEST_MAX = 300;
const oneLine = (text: string) => text.replace(/\s+/g, " ").replace(/`{3,}/g, "").trim().slice(0, STORY_REQUEST_MAX);

export function readingMode(message: string, previous: Previous): ReadingMode | null {
  const reading = isReadingRequest(message, previous);
  const story = detectStory(message);
  if (!reading && !story) return null;
  const text = readingText(message, previous);
  if (text && reading) return { kind: "texte", text };
  if (story || !PAGE.test(normalize(message))) return { kind: "histoire", request: oneLine(message) };
  return { kind: "page" };
}

/** Contenu du bloc pour ce mode (ce que la carte reçoit). */
export function readingSpec(mode: ReadingMode): string {
  if (mode.kind === "texte") return `texte\n${mode.text}`;
  if (mode.kind === "histoire") return `histoire\n${oneLine(mode.request)}`;
  return "page";
}

/** Met le bloc de ce mode dans la réponse de Tamilya (elle n'a rien à recopier), ou l'ajoute. */
export function withSceneBlock(reply: string, mode: ReadingMode): string {
  const block = `\n\n${FENCE}${READING_BLOCK}\n${readingSpec(mode)}\n${FENCE}`;
  const start = reply.indexOf(FENCE + READING_BLOCK);
  if (start < 0) return reply + block;
  const end = reply.indexOf(FENCE, start + FENCE.length + READING_BLOCK.length);
  const after = end < 0 ? "" : reply.slice(end + FENCE.length);
  return reply.slice(0, start).trimEnd() + block + after;
}

/** Lit le bloc côté carte. Null : le bloc s'écrit encore (« texte » ou « histoire » seuls). */
export function parseReadingSpec(block: string): ReadingMode | null {
  const body = block.replace(/\r/g, "").trim();
  const rest = (word: string) => body.slice(word.length).trim();
  if (body.startsWith("texte")) return rest("texte") ? { kind: "texte", text: rest("texte") } : null;
  // « histoire » seul : la demande n'est pas encore glissée par le serveur, on attend.
  if (body.startsWith("histoire")) return rest("histoire") ? { kind: "histoire", request: rest("histoire") } : null;
  return { kind: "page" };
}

/** Lit le bloc côté carte : le texte à lire, ou null (photo à prendre). */
export function parseReadingBlock(block: string): string | null {
  const body = block.replace(/\r/g, "").trim();
  if (!body.startsWith("texte")) return null;
  const text = body.slice("texte".length).trim();
  return text || null;
}

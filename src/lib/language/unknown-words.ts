/**
 * Avec son maître, Awa parle shimaoré ; un mot qu'elle ne connaît pas encore,
 * elle l'écrit en français entre doubles crochets : « Jéjé ! [[marché]] … ».
 * Ces mots s'affichent en couleur : ce sont ceux que le maître doit lui apprendre.
 */
export type Segment = { text: string; french: boolean };

// Jusqu'à 300 caractères : une phrase entière restée en français (enforceShimaore).
const UNKNOWN = /\[\[([^[\]\n]{1,300})\]\]/g;

export function splitUnknownWords(text: string): Segment[] {
  const segments: Segment[] = [];
  let last = 0;
  for (const match of text.matchAll(UNKNOWN)) {
    if (match.index > last) segments.push({ text: text.slice(last, match.index), french: false });
    segments.push({ text: match[1].trim(), french: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), french: false });
  return segments;
}

/** Markdown : [[mot]] devient un lien « #fr », affiché en couleur par le composant Markdown. */
export function markUnknownWords(markdown: string): string {
  return markdown.replace(UNKNOWN, (_, word: string) => `[${word.trim().replace(/[[\]]/g, "")}](#fr)`);
}

// « Traduction : … », « (Translation: …) », « En français : … », « FR : … » en début de ligne.
const TRANSLATION = /^[\s>*_(\-[]*(?:traduction|translation|en\s+fran[çc]ais|fr)\s*[:：]/im;

/**
 * Les petits modèles ajoutent une traduction sous leur réponse malgré la
 * consigne : tout ce qui suit la première ligne de traduction est retiré.
 */
export function stripTranslation(text: string): string {
  const match = TRANSLATION.exec(text);
  if (!match || match.index === 0) return text;
  return text.slice(0, match.index).trimEnd();
}

const FRENCH_WORDS = new Set(
  (
    "le la les un une des de du d l j c qu s n m t et est sont suis es ai as ont je tu il elle on nous vous ils elles " +
    "me te se moi toi lui leur pas ne plus que qui quoi pour dans sur avec sans ce cet cette ces ça cela " +
    "mais ou où donc car si très bien bon bonne oui non merci bonjour salut accord d'accord comment pourquoi quand " +
    "mon ma mes ton ta tes son sa ses notre votre au aux en y à maintenant aussi encore partir réponds parle " +
    "français française vais va vas fait faire dit dire peux peut veux veut"
  ).split(" "),
);

/** Une phrase est-elle en français ? (un tiers de mots français au moins, ou deux sur une phrase courte) */
export function looksFrench(text: string): boolean {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (words.length === 0) return false;
  const hits = words.filter((w) => FRENCH_WORDS.has(w)).length;
  return words.length <= 3 ? hits >= 2 || (words.length === 1 && hits === 1) : hits / words.length >= 1 / 3;
}

/** « [[D'accord, c'est noté]] ! » : la ponctuation finale reste hors des crochets. */
function wrapSentence(sentence: string): string {
  const lead = sentence.match(/^\s*/)?.[0] ?? "";
  const trail = sentence.match(/\s*$/)?.[0] ?? "";
  const [, words = "", punctuation = ""] = sentence.trim().replace(/[*_]/g, "").match(/^([\s\S]*?)(\s*[.!?…:]*)$/) ?? [];
  return words ? `${lead}[[${words}]]${punctuation}${trail}` : sentence;
}

/**
 * Mode maître : la réponse ne doit contenir que du shimaoré. Les traductions
 * ajoutées par le modèle sont retirées et chaque phrase restée en français
 * devient un [[mot à apprendre]], affiché en couleur.
 */
export function enforceShimaore(text: string): string {
  const cleaned = stripTranslation(text)
    // « Kwezi ! — *Bonjour !* » : traduction en italique après un tiret.
    .replace(/[ \t]*[—–][ \t]*([*_])[^*_\n]+\1/g, "")
    // « Kwezi ! (Bonjour !) »
    .replace(/[ \t]*\(([^()\n]+)\)/g, (match, inner: string) => (looksFrench(inner) ? "" : match));

  return cleaned
    .split("\n")
    .map((line) =>
      splitUnknownWords(line)
        .map((segment) =>
          segment.french
            ? `[[${segment.text}]]`
            : segment.text.replace(/[^.!?…]+[.!?…]*/g, (sentence) => (looksFrench(sentence) ? wrapSentence(sentence) : sentence)),
        )
        .join(""),
    )
    .join("\n")
    .trim();
}

const key = (french: string) => french.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Remplace chaque [[mot]] dont le maître a donné la traduction par le
 * shimaoré appris. Les messages enregistrés ne changent pas : la correction
 * s'applique à l'affichage et à ce que le modèle relit, pour toujours.
 */
export function fillKnownWords(text: string, translations: ReadonlyMap<string, string>): string {
  if (translations.size === 0 || !text.includes("[[")) return text;
  return text.replace(UNKNOWN, (match, french: string) => translations.get(key(french)) ?? match);
}

/** Table français → shimaoré pour fillKnownWords. */
export function translationTable(entries: Iterable<{ french: string; shimaore: string }>): Map<string, string> {
  return new Map(Array.from(entries, (entry) => [key(entry.french), entry.shimaore] as const));
}

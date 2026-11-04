/**
 * Avec son maître, Tamilya parle shimaoré ; un mot qu'elle ne connaît pas encore,
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

/** Mot français courant (« le », « mais », « bonjour ») : jamais pris pour du shimaoré. */
export const isFrenchWord = (word: string) => FRENCH_WORDS.has(word.toLowerCase().replace(/^[ldjcqsnmt][’']/, ""));

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
  // Blocs de code (dont ```creneaux-code```, le tableau du code de la route) :
  // mis de côté pendant le nettoyage, ce n'est pas du français à traduire.
  const blocks: string[] = [];
  const restore = (result: string) => result.replace(/\u0000(\d+)\u0000/g, (_, i: string) => blocks[Number(i)] ?? "");
  const kept = text.replace(/```[\s\S]*?(?:```|$)/g, (block) => `\u0000${blocks.push(block) - 1}\u0000`);

  const cleaned = stripTranslation(kept)
    // « Kwezi ! — *Bonjour !* » : traduction en italique après un tiret.
    .replace(/[ \t]*[—–][ \t]*([*_])[^*_\n]+\1/g, "")
    // « Kwezi ! (Bonjour !) »
    .replace(/[ \t]*\(([^()\n]+)\)/g, (match, inner: string) => (looksFrench(inner) ? "" : match));

  return restore(
    cleaned
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
      .trim(),
  );
}

/**
 * Clé d'un mot français pour retrouver sa traduction : « [[Le marché !]] »,
 * « marche » et « marchés » donnent la même. Sans accents, sans article ni
 * ponctuation autour.
 */
const key = (french: string) =>
  french
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’']/g, "'")
    .replace(/^[\s"«“(]+|[\s"»”).,!?…:;]+$/g, "")
    .replace(/^(?:le |la |les |l'|un |une |des |du |de la |de l'|d'|mon |ma |mes |ton |ta |tes |son |sa |ses )/, "")
    .replace(/\s+/g, " ");

/** Même clé, au singulier (« marchés » → « marche »). */
const singular = (k: string) => k.replace(/(?<=\p{L}{3})[sx]$/u, "");

const wordsOf = (k: string) => k.match(/[\p{L}\p{N}€'$]+/gu) ?? [];

/** Plus longue suite de mots communs, dans l'ordre (« Voici les tacos… » / « Voici les meilleurs tacos… »). */
function commonWords(a: readonly string[], b: readonly string[]): number {
  let previous = new Array<number>(b.length + 1).fill(0);
  for (const wordA of a) {
    const current = [0];
    for (let j = 0; j < b.length; j++) current.push(wordA === b[j] ? previous[j] + 1 : Math.max(previous[j + 1], current[j]));
    previous = current;
  }
  return previous[b.length];
}

/**
 * Phrase apprise que Tamilya a redite à peine autrement : un ou deux mots
 * ajoutés ou retirés (« Voici les meilleurs tacos disponibles près de chez
 * toi » pour « Voici les tacos disponibles près de chez toi »).
 */
function closePhrase(k: string, phrases: readonly Learned[]): string | undefined {
  const words = wordsOf(k);
  if (words.length < 3) return undefined;
  let best: { score: number; shimaore: string } | undefined;
  for (const phrase of phrases) {
    if (phrase.words.length < 3) continue;
    // Tri rapide avant le calcul complet : les mots communs ne dépassent jamais
    // ceux du texte présents dans la phrase apprise (même résultat, bien plus vite).
    const slackMax = Math.max(1, Math.floor(phrase.words.length / 4));
    if (Math.abs(phrase.words.length - words.length) > slackMax) continue;
    let possible = 0;
    for (const word of words) if (phrase.wordSet.has(word)) possible++;
    possible = Math.min(possible, phrase.words.length);
    if (phrase.words.length - possible > slackMax || words.length - possible > slackMax) continue;
    const common = commonWords(words, phrase.words);
    const slack = Math.max(1, Math.floor(phrase.words.length / 4));
    if (phrase.words.length - common > slack || words.length - common > slack) continue;
    const score = common / Math.max(words.length, phrase.words.length);
    if (!best || score > best.score) best = { score, shimaore: phrase.shimaore };
  }
  return best?.shimaore;
}

/** Minuscules, sans accents, caractère par caractère : les positions restent celles du texte d'origine. */
const fold = (text: string) =>
  Array.from(text, (c) => {
    const f = c.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[’]/g, "'");
    return f.length === c.length ? f : c;
  }).join("");

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Morceaux appris (deux mots ou plus) au milieu d'une phrase restée en
 * français : « [[De Trévani jusqu'à Mamoudzou, le taxi coûte 3 €]] » devient
 * « Trévani taa Mamoudzou, [[le taxi coûte 3 €]] ».
 */
function fillPieces(french: string, phrases: readonly Learned[]): string | undefined {
  const folded = fold(french);
  const taken: { start: number; end: number; shimaore: string }[] = [];
  for (const phrase of phrases) {
    // Un morceau dont un mot manque au texte ne peut pas s'y trouver : pas d'expression régulière à essayer.
    if (!phrase.words.every((word) => folded.includes(word))) continue;
    const pattern = (phrase.pattern ??= new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(phrase.k).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "gu"));
    for (const match of folded.matchAll(pattern)) {
      const start = match.index;
      const end = start + match[0].length;
      if (taken.some((t) => start < t.end && end > t.start)) continue;
      taken.push({ start, end, shimaore: phrase.shimaore });
    }
  }
  if (taken.length === 0) return undefined;
  taken.sort((a, b) => a.start - b.start);
  let out = "";
  let last = 0;
  const rest = (piece: string) => {
    // Ce qui reste en français repart entre crochets ; la ponctuation seule, non.
    const [, lead = "", words = "", trail = ""] = piece.match(/^([\s,;:.!?…—–-]*)([\s\S]*?)([\s,;:.!?…—–-]*)$/) ?? [];
    return /\p{L}/u.test(words) ? `${lead}[[${words}]]${trail}` : piece;
  };
  for (const t of taken) {
    out += rest(french.slice(last, t.start)) + t.shimaore;
    last = t.end;
  }
  return out + rest(french.slice(last));
}

/** Traduction apprise, découpée une fois par table (mots, et l'expression régulière quand elle sert). */
type Learned = { k: string; shimaore: string; words: string[]; wordSet: Set<string>; pattern?: RegExp };

/**
 * Phrases (trois mots ou plus) et morceaux (deux mots ou plus, les plus longs
 * d'abord) d'une table, calculés une seule fois : fillKnownWords est appelé sur
 * tout l'historique avant chaque réponse, avec des milliers de traductions.
 */
const prepared = new WeakMap<ReadonlyMap<string, string>, { size: number; phrases: Learned[]; pieces: Learned[] }>();

function prepareTable(translations: ReadonlyMap<string, string>) {
  const known = prepared.get(translations);
  if (known && known.size === translations.size) return known;
  const entries: Learned[] = [...translations].map(([k, shimaore]) => {
    const words = wordsOf(k);
    return { k, shimaore, words, wordSet: new Set(words) };
  });
  const result = {
    size: translations.size,
    phrases: entries.filter((e) => e.words.length >= 3),
    // Les plus longs d'abord : « merci beaucoup » passe avant « merci ».
    pieces: entries.filter((e) => e.words.length >= 2).sort((a, b) => b.k.length - a.k.length),
  };
  prepared.set(translations, result);
  return result;
}

/**
 * Remplace chaque [[mot]] dont le maître a donné la traduction par le
 * shimaoré appris (même avec un article, une majuscule ou au pluriel). Une
 * phrase apprise redite à peine autrement est reconnue aussi, et les morceaux
 * appris au milieu d'une phrase plus longue sont remplacés. Les messages
 * enregistrés ne changent pas : la correction s'applique à l'affichage et à
 * ce que le modèle relit, pour toujours.
 */
export function fillKnownWords(text: string, translations: ReadonlyMap<string, string>): string {
  if (translations.size === 0 || !text.includes("[[")) return text;
  const { phrases, pieces } = prepareTable(translations);
  return text.replace(UNKNOWN, (match, french: string) => {
    const k = key(french);
    return translations.get(k) ?? translations.get(singular(k)) ?? closePhrase(k, phrases) ?? fillPieces(french, pieces) ?? match;
  });
}

/** Table français → shimaoré pour fillKnownWords (le dernier appris l'emporte). */
export function translationTable(entries: Iterable<{ french: string; shimaore: string }>): Map<string, string> {
  const table = new Map<string, string>();
  for (const entry of entries) {
    const k = key(entry.french);
    table.set(k, entry.shimaore);
    if (!table.has(singular(k))) table.set(singular(k), entry.shimaore);
  }
  return table;
}

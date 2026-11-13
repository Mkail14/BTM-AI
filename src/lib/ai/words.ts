import { isFrenchWord, looksFrench } from "@/lib/language/unknown-words";
import { editDistance, shimaoreKey } from "@/lib/language/shimaore-match";

export type WordEntry = { french: string; shimaore: string; category?: string };

/** Minuscules sans accents ni apostrophes, pour comparer « École » et « ecole ». */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ");
}

function tokens(text: string): string[] {
  return normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Mot français, au singulier comme au pluriel (« maisons » trouve « maison ») : même forme sans s ni x final. */
const frenchStem = (word: string) => word.replace(/[sx]$/, "");

/** Position où les `size` mots de la phrase apparaissent à la suite parmi `count` mots, ou -1. */
function findSequence(count: number, size: number, same: (at: number, j: number) => boolean): number {
  if (size === 0) return -1;
  for (let i = 0; i + size <= count; i++) {
    let ok = true;
    for (let j = 0; j < size && ok; j++) ok = same(i + j, j);
    if (ok) return i;
  }
  return -1;
}

const SHIMAORE_TOPIC = /shimaor|shimaore|maore|mahorais/;

/**
 * Vocabulaire préparé une fois (mots découpés, clés shimaoré, clés rangées par
 * longueur, ordre « expressions longues d'abord ») : le dictionnaire compte des
 * milliers d'entrées, et tout refaire à chaque message coûtait des centaines de ms.
 * Gardé tant que le tableau d'entrées est le même (cerveau en cache).
 */
type Prepared = {
  size: number;
  /** Mots français de chaque entrée, sans s ni x final. */
  french: string[][];
  /** Mots shimaoré de chaque entrée, et leur forme de comparaison (shimaoreKey). */
  shimaore: string[][];
  keys: string[][];
  /** Toutes les clés connues, et rangées par longueur pour l'écart d'une ou deux lettres. */
  keySet: Set<string>;
  keysByLength: Map<number, string[]>;
  /** Entrées des plus longues expressions aux plus courtes (ordre stable). */
  longestFirst: number[];
};

const preparedCache = new WeakMap<readonly WordEntry[], Prepared>();

function prepare(entries: readonly WordEntry[]): Prepared {
  const known = preparedCache.get(entries);
  if (known && known.size === entries.length) return known;
  const french = entries.map((entry) => tokens(entry.french).map(frenchStem));
  const shimaore = entries.map((entry) => tokens(entry.shimaore));
  const keys = shimaore.map((words) => words.map(shimaoreKey));
  const keySet = new Set(keys.flat());
  const keysByLength = new Map<number, string[]>();
  for (const key of keySet) {
    const list = keysByLength.get(key.length);
    if (list) list.push(key);
    else keysByLength.set(key.length, [key]);
  }
  const longestFirst = entries.map((_, i) => i).sort((a, b) => shimaore[b].length - shimaore[a].length);
  const result: Prepared = { size: entries.length, french, shimaore, keys, keySet, keysByLength, longestFirst };
  preparedCache.set(entries, result);
  return result;
}

/** Une seule lettre changée, ajoutée ou retirée (sans tableau : appelé des milliers de fois par message). */
function oneEditApart(a: string, b: string): boolean {
  if (a.length < b.length) [a, b] = [b, a];
  if (a.length - b.length > 1) return false;
  let i = 0;
  while (i < b.length && a[i] === b[i]) i++;
  // Même longueur : le reste doit être identique après la lettre changée ; sinon après la lettre en trop.
  return a.length === b.length ? a.slice(i + 1) === b.slice(i + 1) : a.slice(i + 1) === b.slice(i);
}

/**
 * Clés du vocabulaire qui valent le mot de clé `key` (même règle que
 * sameShimaoreWord) : la même, ou une lettre d'écart à partir de 5 lettres (deux
 * à partir de 9). La distance n'est calculée que pour les clés de longueur proche.
 */
function similarKeys(index: Prepared, key: string, memo: Map<string, Set<string>>): Set<string> {
  const cached = memo.get(key);
  if (cached) return cached;
  const found = new Set<string>();
  if (index.keySet.has(key)) found.add(key);
  if (key.length >= 5) {
    for (let length = Math.max(5, key.length - 2); length <= key.length + 2; length++) {
      for (const other of index.keysByLength.get(length) ?? []) {
        if (other === key) continue;
        if (Math.min(key.length, length) >= 9 ? editDistance(key, other, 2) <= 2 : oneEditApart(key, other)) found.add(other);
      }
    }
  }
  memo.set(key, found);
  return found;
}

/**
 * Mots du dictionnaire à donner au modèle pour ce message : d'abord ceux qui y
 * apparaissent (en français, ou en shimaoré même écrit autrement), puis, si le
 * message parle de shimaoré, d'autres mots jusqu'à `maxTopic`, les plus
 * récemment appris d'abord (`entries` va du plus ancien au plus récent).
 */
export function selectWords<T extends WordEntry>(
  entries: readonly T[],
  message: string,
  {
    maxMatched = 80,
    maxTopic = 400,
    topic = false,
  }: { maxMatched?: number; maxTopic?: number; /** Toujours compléter (Tamilya parle shimaoré). */ topic?: boolean } = {},
): T[] {
  const index = prepare(entries);
  const words = tokens(message);
  const stems = words.map(frenchStem);
  const stemSet = new Set(stems);
  // Pour chaque mot du message : les clés shimaoré du vocabulaire qui lui correspondent.
  const memo = new Map<string, Set<string>>();
  const near = words.map((word) => similarKeys(index, shimaoreKey(word), memo));
  const anyNear = new Set(near.flatMap((set) => [...set]));

  const matched: T[] = [];
  const rest: T[] = [];
  entries.forEach((entry, e) => {
    const french = index.french[e];
    const keys = index.keys[e];
    const inFrench =
      french.length > 0 &&
      stemSet.has(french[0]) &&
      findSequence(stems.length, french.length, (at, j) => stems[at] === french[j]) >= 0;
    const inShimaore =
      !inFrench &&
      keys.length > 0 &&
      anyNear.has(keys[0]) &&
      findSequence(words.length, keys.length, (at, j) => near[at].has(keys[j])) >= 0;
    (inFrench || inShimaore ? matched : rest).push(entry);
  });
  // Trop de mots trouvés (long texte à traduire) : les plus récents restent, ce sont les leçons et corrections.
  const kept = matched.slice(Math.max(0, matched.length - maxMatched));
  if (topic || SHIMAORE_TOPIC.test(normalize(message))) kept.push(...rest.reverse().slice(0, Math.max(0, maxTopic - kept.length)));
  return kept;
}

/** Les mots les plus récents d'abord : pour un même mot français, la dernière leçon remplace l'ancienne. */
export function withRecentWords<T extends WordEntry>(words: readonly T[], recent: readonly T[]): T[] {
  const known = new Set(recent.map((word) => word.french.trim().toLowerCase()));
  return [...recent, ...words.filter((word) => !known.has(word.french.trim().toLowerCase()))];
}

export type Gloss = {
  /** Mots shimaoré du message reconnus : tels qu'écrits, et leur entrée du vocabulaire. */
  known: { written: string; french: string; shimaore: string }[];
  /** Mots qui semblent shimaoré mais que Tamilya ne connaît pas. */
  unknown: string[];
};

/**
 * Lecture du message, mot à mot, avec le vocabulaire validé : ce que veut
 * dire chaque mot shimaoré reconnu (même mal orthographié), et les mots
 * que Tamilya ne connaît pas. Donné au modèle pour qu'il comprenne sans deviner.
 */
export function glossMessage(entries: readonly WordEntry[], message: string): Gloss {
  const index = prepare(entries);
  const raw = message.match(/[\p{L}\p{N}’'-]+/gu) ?? [];
  const words = raw.map((w) => normalize(w).replace(/\s+/g, ""));
  const french = new Set(raw.map((w, i) => (isFrenchWord(w) ? words[i] : "")).filter(Boolean));
  // Un mot français courant (« mais », « tout ») ne passe pour du shimaoré que s'il est écrit pareil.
  const memo = new Map<string, Set<string>>();
  const near = words.map((word) => (french.has(word) ? null : similarKeys(index, shimaoreKey(word), memo)));
  const anyNear = new Set(near.flatMap((set) => (set ? [...set] : [])));
  const covered = new Set<number>();
  const known: Gloss["known"] = [];

  // Expressions les plus longues d'abord : « marahaba mana » avant « marahaba ».
  for (const e of index.longestFirst) {
    const phrase = index.shimaore[e];
    const keys = index.keys[e];
    if (phrase.length === 0 || !(french.has(phrase[0]) || anyNear.has(keys[0]))) continue;
    const at = findSequence(words.length, phrase.length, (i, j) => {
      const set = near[i];
      return set ? set.has(keys[j]) : words[i] === phrase[j];
    });
    if (at < 0 || phrase.some((_, j) => covered.has(at + j))) continue;
    phrase.forEach((_, j) => covered.add(at + j));
    const entry = entries[e];
    known.push({ written: raw.slice(at, at + phrase.length).join(" "), french: entry.french, shimaore: entry.shimaore });
    if (known.length >= 30) break;
  }

  // Mots inconnus : seulement si le message est surtout en shimaoré (sinon, ce sont des mots français).
  const unknown =
    looksFrench(message) || raw.length === 0
      ? []
      : [
          ...new Set(
            raw.filter((w, i) => !covered.has(i) && w.length >= 3 && !/\d/.test(w) && !isFrenchWord(w) && !/^(?:tamilya|btm|mayotte|ok|okay)$/i.test(w)),
          ),
        ].slice(0, 8);

  return { known, unknown };
}

import { isFrenchWord, looksFrench } from "@/lib/language/unknown-words";
import { sameShimaoreWord } from "@/lib/language/shimaore-match";

export type WordEntry = { french: string; shimaore: string; category?: string };

/** Minuscules sans accents ni apostrophes, pour comparer « École » et « ecole ». */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ");
}

function tokens(text: string): string[] {
  return normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Mot français, au singulier comme au pluriel (« maisons » trouve « maison »). */
const sameFrenchWord = (a: string, b: string) => a === b || a.replace(/[sx]$/, "") === b.replace(/[sx]$/, "");

/** Position où tous les mots de `phrase` apparaissent à la suite dans `words`, ou -1. */
function findSequence(words: string[], phrase: string[], same: (a: string, b: string) => boolean): number {
  if (phrase.length === 0) return -1;
  for (let i = 0; i + phrase.length <= words.length; i++) {
    if (phrase.every((w, j) => same(words[i + j], w))) return i;
  }
  return -1;
}

const SHIMAORE_TOPIC = /shimaor|shimaore|maore|mahorais/;

const inFrench = (entry: WordEntry, words: string[]) => findSequence(words, tokens(entry.french), sameFrenchWord) >= 0;
const inShimaore = (entry: WordEntry, words: string[]) => findSequence(words, tokens(entry.shimaore), sameShimaoreWord) >= 0;

/**
 * Mots du dictionnaire à donner au modèle pour ce message : d'abord ceux qui y
 * apparaissent (en français, ou en shimaoré même écrit autrement), puis, si le
 * message parle de shimaoré, d'autres mots jusqu'à `maxTopic`, les plus
 * récemment appris d'abord (`entries` va du plus ancien au plus récent).
 */
export function selectWords(
  entries: readonly WordEntry[],
  message: string,
  {
    maxMatched = 80,
    maxTopic = 400,
    topic = false,
  }: { maxMatched?: number; maxTopic?: number; /** Toujours compléter (Tamilya parle shimaoré). */ topic?: boolean } = {},
): WordEntry[] {
  const words = tokens(message);
  const matched: WordEntry[] = [];
  const rest: WordEntry[] = [];
  for (const entry of entries) {
    if (inFrench(entry, words) || inShimaore(entry, words)) matched.push(entry);
    else rest.push(entry);
  }
  const kept = matched.slice(0, maxMatched);
  if (topic || SHIMAORE_TOPIC.test(normalize(message))) kept.push(...rest.reverse().slice(0, Math.max(0, maxTopic - kept.length)));
  return kept;
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
  const raw = message.match(/[\p{L}\p{N}’'-]+/gu) ?? [];
  const words = raw.map((w) => normalize(w).replace(/\s+/g, ""));
  const french = new Set(raw.map((w, i) => (isFrenchWord(w) ? words[i] : "")).filter(Boolean));
  // Un mot français courant (« mais », « tout ») ne passe pour du shimaoré que s'il est écrit pareil.
  const same = (word: string, entryWord: string) => (french.has(word) ? word === entryWord : sameShimaoreWord(word, entryWord));
  const covered = new Set<number>();
  const known: Gloss["known"] = [];

  // Expressions les plus longues d'abord : « marahaba mana » avant « marahaba ».
  const sorted = [...entries].sort((a, b) => tokens(b.shimaore).length - tokens(a.shimaore).length);
  for (const entry of sorted) {
    const phrase = tokens(entry.shimaore);
    const at = findSequence(words, phrase, same);
    if (at < 0 || phrase.some((_, j) => covered.has(at + j))) continue;
    phrase.forEach((_, j) => covered.add(at + j));
    known.push({ written: raw.slice(at, at + phrase.length).join(" "), french: entry.french, shimaore: entry.shimaore });
    if (known.length >= 30) break;
  }

  // Mots inconnus : seulement si le message est surtout en shimaoré (sinon, ce sont des mots français).
  const unknown =
    looksFrench(message) || raw.length === 0
      ? []
      : [
          ...new Set(
            raw.filter((w, i) => !covered.has(i) && w.length >= 3 && !/\d/.test(w) && !isFrenchWord(w) && !/^(?:awa|tamilya|btm|mayotte|ok|okay)$/i.test(w)),
          ),
        ].slice(0, 8);

  return { known, unknown };
}

import { isFrenchWord, looksFrench } from "./unknown-words";
import { editDistance, shimaoreKey } from "./shimaore-match";

/**
 * Aucune reconnaissance vocale ne connaît le shimaoré : elle écrit à l'oreille
 * (« marahabaa », « kwézi wa fétché »). Ici, ce qu'elle a écrit est rapproché du
 * lexique validé de Tamilya, pour afficher et garder la bonne écriture.
 *
 * Prudence avant tout : une phrase surtout française n'est pas touchée (le lexique
 * contient des mots empruntés, « komandé », qui ressemblent à « commander »), un mot
 * court doit correspondre exactement, plusieurs mots n'en deviennent jamais un seul,
 * et si deux mots du lexique sont aussi proches, on ne choisit pas. Un mot absent du
 * lexique reste tel quel.
 */

type Entry = { text: string; key: string; size: number };
export type SnapLexicon = { entries: Entry[]; longest: number };

/** Une expression plus longue n'est plus une erreur d'écoute, mais une autre phrase. */
const MAX_WORDS = 5;
const MIN_FUZZY_LETTERS = 5;
/** En dessous (« ah », « wa »), une correspondance ne prouve rien. */
const MIN_LETTERS = 3;
/** Prénoms qui ressemblent à des mots du lexique : à ne jamais remplacer. */
const NAMES = new Set(["awa", "tamilya"]);

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** Écart toléré : aucun pour un mot court, comme sameShimaoreWord au-delà. */
const allowedGap = (letters: number) => (letters < MIN_FUZZY_LETTERS ? 0 : letters >= 9 ? 2 : 1);

/** Prépare le lexique : entrées séparées, sans ponctuation finale, sans les mots français qui s'y sont glissés. */
export function buildSnapLexicon(words: string[]): SnapLexicon {
  const entries = new Map<string, Entry>();
  for (const word of words) {
    for (const part of word.split(/[/,;|]/)) {
      const text = part.replace(/[.?!…:]+\s*$/, "").trim();
      const tokens = text.match(WORD) ?? [];
      if (tokens.length === 0 || tokens.length > MAX_WORDS || tokens.every(isFrenchWord)) continue;
      const key = shimaoreKey(tokens.join(""));
      if (key.length >= MIN_LETTERS && !entries.has(key)) entries.set(key, { text, key, size: tokens.length });
    }
  }
  const list = [...entries.values()];
  return { entries: list, longest: list.reduce((most, entry) => Math.max(most, entry.size), 1) };
}

/** Entrée la plus proche de `key`, ou null si rien n'est assez proche ou si deux entrées se valent. */
function closest(key: string, size: number, lexicon: SnapLexicon): Entry | null {
  let best: Entry | null = null;
  let bestGap = Infinity;
  let tied = false;
  for (const entry of lexicon.entries) {
    // Plusieurs mots entendus n'en font pas un seul : « aller à » n'est pas « flera ».
    if (size > 1 && entry.size === 1) continue;
    const allowed = allowedGap(Math.min(key.length, entry.key.length));
    const gap = entry.key === key ? 0 : allowed === 0 ? allowed + 1 : editDistance(key, entry.key, allowed);
    if (gap > allowed) continue;
    if (gap < bestGap) {
      best = entry;
      bestGap = gap;
      tied = false;
    } else if (gap === bestGap && entry.text.toLowerCase() !== best?.text.toLowerCase()) {
      tied = true;
    }
  }
  return tied ? null : best;
}

/** Remplace, dans un texte transcrit, ce qui correspond à un mot ou une expression du lexique. */
export function snapToLexicon(text: string, lexicon: SnapLexicon): string {
  if (lexicon.entries.length === 0) return text;
  return text
    .split(/(?<=[.!?…\n])/)
    .map((sentence) => (looksFrench(sentence) ? sentence : snapSentence(sentence, lexicon)))
    .join("");
}

function snapSentence(text: string, lexicon: SnapLexicon): string {
  const tokens = [...text.matchAll(WORD)].map((match) => ({ word: match[0], start: match.index, end: match.index + match[0].length }));
  let result = "";
  let position = 0;
  for (let i = 0; i < tokens.length; ) {
    let snapped = false;
    // L'expression la plus longue d'abord : « kwezi wa fetche » avant « kwezi ».
    for (let size = Math.min(lexicon.longest, tokens.length - i); size >= 1 && !snapped; size--) {
      const span = tokens.slice(i, i + size);
      // Que du français : la phrase est juste, on n'y touche pas.
      if (span.every(({ word }) => isFrenchWord(word))) continue;
      if (span.some(({ word }) => NAMES.has(word.toLowerCase()))) continue;
      const entry = closest(shimaoreKey(span.map(({ word }) => word).join("")), size, lexicon);
      if (!entry) continue;
      const first = span[0];
      const last = span[size - 1];
      // Même écriture, à la majuscule près : c'est juste, on passe à la suite.
      if (text.slice(first.start, last.end).toLowerCase() !== entry.text.toLowerCase()) {
        result += text.slice(position, first.start) + (/^\p{Lu}/u.test(first.word) ? entry.text[0].toUpperCase() + entry.text.slice(1) : entry.text);
        position = last.end;
      }
      i += size;
      snapped = true;
    }
    if (!snapped) i++;
  }
  return result + text.slice(position);
}

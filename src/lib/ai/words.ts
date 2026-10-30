export type WordEntry = { french: string; shimaore: string; category?: string };

/** Minuscules sans accents ni apostrophes, pour comparer « École » et « ecole ». */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’']/g, " ");
}

function tokens(text: string): string[] {
  return normalize(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Vrai si tous les mots de `phrase` apparaissent à la suite dans `words`. */
function containsSequence(words: string[], phrase: string[]): boolean {
  if (phrase.length === 0) return false;
  for (let i = 0; i + phrase.length <= words.length; i++) {
    if (phrase.every((w, j) => words[i + j] === w)) return true;
  }
  return false;
}

const SHIMAORE_TOPIC = /shimaor|shimaore|maore|mahorais/;

/**
 * Mots du dictionnaire à donner au modèle pour ce message : d'abord ceux qui y
 * apparaissent (en français ou en shimaoré), puis, si le message parle de
 * shimaoré, d'autres mots jusqu'à `maxTopic`.
 */
export function selectWords(
  entries: readonly WordEntry[],
  message: string,
  {
    maxMatched = 80,
    maxTopic = 300,
    topic = false,
  }: { maxMatched?: number; maxTopic?: number; /** Toujours compléter (Awa parle shimaoré). */ topic?: boolean } = {},
): WordEntry[] {
  const words = tokens(message);
  const matched: WordEntry[] = [];
  const rest: WordEntry[] = [];
  for (const entry of entries) {
    if (containsSequence(words, tokens(entry.french)) || containsSequence(words, tokens(entry.shimaore))) matched.push(entry);
    else rest.push(entry);
  }
  const kept = matched.slice(0, maxMatched);
  if (topic || SHIMAORE_TOPIC.test(normalize(message))) kept.push(...rest.slice(0, Math.max(0, maxTopic - kept.length)));
  return kept;
}

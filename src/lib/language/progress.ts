import { fillKnownWords, isFrenchWord, splitUnknownWords } from "./unknown-words";

/**
 * Progrès de Tamilya en shimaoré, lus dans ses réponses au maître : la part
 * restée en français ([[…]]) semaine après semaine, et les passages qu'il
 * faut encore lui apprendre.
 */

export type ReplySample = { content: string; createdAt: string };

export type WeekProgress = {
  /** Lundi de la semaine, « AAAA-MM-JJ » (heure de Mayotte). */
  week: string;
  replies: number;
  /** Réponses entièrement en shimaoré, en %. */
  fullyShimaore: number;
  /** Part du texte restée en français, en %. */
  frenchShare: number;
};

export type ToLearn = { french: string; count: number };

const MAYOTTE_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Lundi de la semaine (heure de Mayotte) d'une date ISO. */
export function weekOf(iso: string): string {
  const local = new Date(Date.parse(iso) + MAYOTTE_OFFSET_MS);
  const monday = new Date(local.getTime() - ((local.getUTCDay() + 6) % 7) * DAY_MS);
  return monday.toISOString().slice(0, 10);
}

const letters = (text: string) => (text.match(/\p{L}/gu) ?? []).length;

/** Texte lu par la personne : sans blocs de code (tableaux du code de la route, commandes…). */
const readable = (content: string) => content.replace(/```[\s\S]*?(?:```|$)/g, "");

/** Lettres en français et lettres en tout d'une réponse. */
export function measureReply(content: string): { french: number; total: number } {
  let french = 0;
  let total = 0;
  for (const segment of splitUnknownWords(readable(content))) {
    const n = letters(segment.text);
    total += n;
    if (segment.french) french += n;
  }
  return { french, total };
}

/** Une ligne par semaine, de la plus ancienne à la plus récente. */
export function weeklyProgress(replies: readonly ReplySample[]): WeekProgress[] {
  const weeks = new Map<string, { replies: number; full: number; french: number; total: number }>();
  for (const reply of replies) {
    const { french, total } = measureReply(reply.content);
    if (total === 0) continue;
    const week = weekOf(reply.createdAt);
    const w = weeks.get(week) ?? { replies: 0, full: 0, french: 0, total: 0 };
    w.replies++;
    if (french === 0) w.full++;
    w.french += french;
    w.total += total;
    weeks.set(week, w);
  }
  return [...weeks]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, w]) => ({
      week,
      replies: w.replies,
      fullyShimaore: Math.round((w.full / w.replies) * 100),
      frenchShare: Math.round((w.french / w.total) * 100),
    }));
}

const groupKey = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Passages encore en français dans les réponses, une fois appliqué tout ce
 * que le maître a déjà appris : les plus fréquents d'abord.
 */
export function stillToLearn(replies: readonly ReplySample[], known: ReadonlyMap<string, string>, max = 20): ToLearn[] {
  const counts = new Map<string, ToLearn>();
  for (const reply of replies) {
    for (const segment of splitUnknownWords(fillKnownWords(readable(reply.content), known))) {
      // Un petit mot seul (« de », « le ») ne s'apprend pas hors d'une phrase.
      if (!segment.french || letters(segment.text) < 2 || isFrenchWord(segment.text.trim())) continue;
      const k = groupKey(segment.text);
      const entry = counts.get(k);
      if (entry) entry.count++;
      else counts.set(k, { french: segment.text.replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, ""), count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.french.length - b.french.length).slice(0, max);
}

import "server-only";
import { loadAwaBrain } from "@/lib/ai/brain";
import { buildLexiconTree } from "@/lib/language/curriculum";

/**
 * Progrès d'Awa montrés sur la page d'accueil des visiteurs : uniquement des
 * totaux (aucun mot, aucune donnée personnelle), tirés de son « cerveau ».
 */
export type AwaProgress = {
  /** Mots de shimaoré appris (dictionnaire) et expressions validées. */
  words: number;
  expressions: number;
  /** Fiches de connaissances sur Mayotte. */
  knowledge: number;
  /** Programme de shimaoré : mots essentiels appris sur le total. */
  curriculum: { learned: number; total: number };
  /** Les thèmes les plus avancés du programme. */
  themes: { label: string; hue: number; learned: number; total: number }[];
};

export async function getAwaProgress(): Promise<AwaProgress> {
  const brain = await loadAwaBrain();
  const tree = buildLexiconTree([...brain.words, ...brain.lexicon]);
  const themes = (tree.children ?? [])
    .filter((theme) => theme.total > 0)
    .map((theme) => ({ label: theme.label, hue: theme.hue, learned: theme.learned, total: theme.total }))
    .sort((a, b) => b.learned / b.total - a.learned / a.total)
    .slice(0, 4);
  return {
    words: brain.words.length,
    expressions: brain.lexicon.length,
    knowledge: brain.knowledge.length,
    curriculum: { learned: tree.learned, total: tree.total },
    themes,
  };
}

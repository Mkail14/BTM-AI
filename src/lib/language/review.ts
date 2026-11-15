/**
 * Relecture de Tamilya avant d'envoyer une phrase shimaoré : un deuxième regard
 * qui ne garde que ce que les règles et le vocabulaire du maître permettent.
 */
import type { ValidatedExample } from "./types";

type Rule = { title: string; rule: string; examples: string };
type Word = { french: string; shimaore: string };

export const REVIEW_PROMPT = `Tu relis le brouillon d'une réponse de Tamilya, qui parle shimaoré (langue de Mayotte) avec son maître.
Corrige UNIQUEMENT ce qui contredit les règles ou le vocabulaire donnés plus bas : mauvais ordre des mots, mot différent de celui du vocabulaire, règle non appliquée.
N'invente jamais un mot shimaoré. Un mot que tu ne trouves pas dans le vocabulaire reste tel quel, ou reste en français entre doubles crochets [[comme ça]].
Garde le sens, le ton, la longueur, les [[crochets]], les blocs de code et la mise en forme. N'ajoute ni traduction ni commentaire.
Réponds par le texte final seulement, ou exactement OK si rien n'est à changer.`;

/** Ce que le relecteur reçoit : règles, phrases validées, vocabulaire, puis le brouillon. */
export function buildReviewContent(input: {
  draft: string;
  grammar: readonly Rule[];
  phrases: readonly ValidatedExample[];
  words: readonly Word[];
}): string {
  const rules = input.grammar.map((g) => `- ${g.title} : ${g.rule}${g.examples ? ` (${g.examples})` : ""}`);
  const phrases = input.phrases.slice(0, 40).map((p) => `- ${p.french} → ${p.shimaore}`);
  const words = input.words.slice(0, 80).map((w) => `- ${w.french} → ${w.shimaore}`);
  return [
    `Règles :\n${rules.join("\n") || "(aucune)"}`,
    `Phrases validées :\n${phrases.join("\n") || "(aucune)"}`,
    `Vocabulaire :\n${words.join("\n") || "(aucun)"}`,
    `Brouillon :\n${input.draft}`,
  ].join("\n\n");
}

/** Version relue, ou le brouillon si la relecture est vide, « OK » ou trop différente pour être sûre. */
export function acceptReview(draft: string, output: string): string {
  const reviewed = output.trim().replace(/^```[a-z]*\n?|\n?```$/g, "").trim();
  if (!reviewed || /^ok\b\.?$/i.test(reviewed)) return draft;
  const ratio = reviewed.length / Math.max(draft.length, 1);
  if (ratio < 0.5 || ratio > 1.6) return draft;
  // Les blocs de code (cartes, tableaux) ne doivent jamais bouger.
  const blocks = (s: string) => (s.match(/```[\s\S]*?```/g) ?? []).join("\n");
  if (blocks(draft) !== blocks(reviewed)) return draft;
  return reviewed;
}

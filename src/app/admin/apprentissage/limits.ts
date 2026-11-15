/** Mêmes bornes que les contraintes de la table awa_grammar. */
export const GRAMMAR_LIMITS = { title: 80, rule: 600, examples: 600 } as const;

export type GrammarRow = {
  id: string;
  title: string;
  rule: string;
  examples: string;
  isActive: boolean;
};

/** Doute de Tamilya sur une de ses phrases shimaoré (table awa_questions), en attente de réponse. */
export type QuestionRow = {
  id: string;
  phrase: string;
  french: string;
  question: string;
  source: "chat" | "voix";
  occurrences: number;
  lastSeenAt: string;
};

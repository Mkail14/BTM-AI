/** Mêmes bornes que les contraintes des tables awa_lexicon et awa_words. */
export const LEXICON_LIMITS = { phrase: 200, context: 120, validatedBy: 120 } as const;
export const WORD_LIMITS = { word: 80, category: 40 } as const;

export type LexiconRow = {
  id: string;
  french: string;
  shimaore: string;
  context: string;
  validatedBy: string;
  validatedAt: string;
  isActive: boolean;
};

export type WordRow = { id: string; french: string; shimaore: string; category: string; isActive: boolean };

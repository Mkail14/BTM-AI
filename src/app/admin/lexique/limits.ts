/** Mêmes bornes que les contraintes de la table awa_lexicon. */
export const LEXICON_LIMITS = { phrase: 200, context: 120, validatedBy: 120 } as const;

export type LexiconRow = {
  id: string;
  french: string;
  shimaore: string;
  context: string;
  validatedBy: string;
  validatedAt: string;
  isActive: boolean;
};

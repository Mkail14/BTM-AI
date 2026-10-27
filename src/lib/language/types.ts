/**
 * Exemple bilingue validé par un locuteur de référence. Ces exemples serviront
 * à guider le modèle et, plus tard, à évaluer sa qualité en shimaoré.
 */
export type ValidatedExample = {
  french: string;
  shimaore: string;
  /** Contexte d'usage (salutation, administration, commerce…). */
  context?: string;
  /** Version propre à une personnalité (identifiant → shimaoré), si elle diffère. */
  variants?: Readonly<Record<string, string>>;
  /** Personne ou organisme ayant validé l'exemple. */
  validatedBy: string;
  validatedAt: string;
};

export type SupportedLanguage = "fr" | "shimaore";

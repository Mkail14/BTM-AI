/**
 * Éléments de marque de BTM AI, séparés des composants fonctionnels.
 * Le symbole propre à la branche IA n'est pas encore défini : `symbolSrc`
 * restera null tant qu'aucun fichier validé n'est déposé dans /public/brand/.
 */
export const BRAND = {
  name: "BTM AI",
  wordmark: { primary: "BTM", secondary: "AI" },
  parent: "GROUPE BTM",
  tagline: "L'intelligence artificielle pour Mayotte",
  /** Exemple futur : "/brand/btm-ai-symbol.svg" */
  symbolSrc: null as string | null,
} as const;

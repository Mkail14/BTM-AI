/** Mêmes bornes que les contraintes de la table awa_settings. */
export const CHARACTER_LIMITS = { name: 40, text: 8000 } as const;

export type CharacterDraft = { name: string; identity: string; rules: string };

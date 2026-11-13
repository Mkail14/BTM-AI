/** Mêmes bornes que les contraintes de la table awa_settings. */
export const CHARACTER_LIMITS = { text: 8000 } as const;

/** Le nom n'y figure pas : il est fixe (voir src/lib/ai/tamilya-identity.ts). */
export type CharacterDraft = { identity: string; rules: string };

/**
 * Fonctionnalités que l'administration allume ou éteint pour tous les utilisateurs
 * (/admin/fonctionnalites). Les administrateurs les ont toujours. Code commun au
 * serveur et au navigateur : la liste et les valeurs par défaut seulement.
 */

export const FEATURES = [
  {
    id: "documents",
    label: "Photo ou document",
    description: "Le + de la conversation : prendre une photo, ou envoyer un document ou une image, rangés dans le Google Drive de la personne. Et la page Mes documents.",
    default: true,
  },
  {
    id: "cyclone",
    label: "Cyclones",
    description: "La carte des cyclones, quand on en parle à Tamilya.",
    default: true,
  },
  {
    id: "attestation",
    label: "Attestation d'hébergement",
    description: "Le formulaire d'attestation d'hébergement, quand on la demande à Tamilya.",
    default: true,
  },
  {
    id: "livres",
    label: "Livres lus par Tamilya",
    description: "Un PDF lu en entier, en 3D. Sorti du + le 2026-11-10 : plus d'entrée dans le site pour l'instant. Coûte des appels Gemini à chaque morceau (~4 min d'écoute).",
    default: false,
  },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];
export type FeatureSwitches = Record<FeatureId, boolean>;

export const FEATURE_IDS = FEATURES.map((f) => f.id) as FeatureId[];

export const isFeatureId = (value: unknown): value is FeatureId => typeof value === "string" && (FEATURE_IDS as string[]).includes(value);

/** Valeurs enregistrées (colonne jsonb), complétées par les valeurs par défaut ; le reste est ignoré. */
export function readSwitches(raw: unknown): FeatureSwitches {
  const saved = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(FEATURES.map((f) => [f.id, typeof saved[f.id] === "boolean" ? saved[f.id] : f.default])) as FeatureSwitches;
}

/** Ce que voit cette personne : tout pour un administrateur, sinon ce qui est allumé. */
export function featuresFor(user: { isAdmin?: boolean } | null, switches: FeatureSwitches): FeatureId[] {
  if (user?.isAdmin) return [...FEATURE_IDS];
  return FEATURE_IDS.filter((id) => switches[id]);
}

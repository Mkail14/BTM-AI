/**
 * Fonctionnalités que l'administration allume ou éteint pour tous les utilisateurs
 * (/admin/fonctionnalites). Les administrateurs les ont toujours. Code commun au
 * serveur et au navigateur : la liste et les valeurs par défaut seulement.
 */

export const FEATURES = [
  {
    id: "documents",
    label: "Photo ou document",
    summary: "Prendre une photo ou envoyer un fichier dans la conversation, et la page Mes documents.",
    details: "Le + de la conversation : prendre une photo, ou envoyer un document ou une image, rangés dans le Google Drive de la personne. Et la page Mes documents.",
    default: true,
  },
  {
    id: "cyclone",
    label: "Cyclones",
    summary: "La carte des cyclones, quand on en parle à Tamilya.",
    default: true,
  },
  {
    id: "emploi",
    label: "Offres d'emploi",
    summary: "Les offres d'emploi à Mayotte, avec recherche et filtres.",
    details: "Les offres d'emploi en cours à Mayotte, avec recherche et filtres, quand on les demande à Tamilya : postes des mairies, du Département… (Emploi Territorial) ; France Travail s'y ajoutera quand l'accès à son API sera accordé (FRANCE_TRAVAIL_OFFRES=on).",
    default: true,
  },
  {
    id: "candidatures",
    label: "Postuler aux offres",
    summary: "Comment postuler à chaque offre des mairies et du Département, sous l'offre.",
    details: "Dans la liste des offres de la conversation, un bouton Postuler sous chaque offre Emploi Territorial : mail prêt à envoyer, site de l'employeur ou formulaire, lus sur la page de l'offre. Liste complète : /admin/candidatures.",
    restricted: "Emploi Territorial n'a pas encore donné son accord : leurs mentions légales interdisent de reprendre le contenu de leurs pages sans autorisation.",
    settings: "/admin/candidatures",
    default: false,
  },
  {
    id: "evenements",
    label: "Événements emploi",
    summary: "Job datings, réunions d'information et ateliers à Mayotte.",
    details: "Job datings, réunions d'information et ateliers à Mayotte (France Travail) : quand on les demande, ou quand quelqu'un ne sait pas quoi faire de ses journées.",
    default: true,
  },
  {
    id: "eau",
    label: "Carte de l'eau",
    summary: "Où il y a de l'eau en ce moment, sur une carte.",
    details: "La carte des tours d'eau (où il y a de l'eau en ce moment), d'après le planning officiel de la SMAE, lu automatiquement toutes les heures.",
    settings: "/admin/eau",
    default: true,
  },
  {
    id: "entreprises",
    label: "Profil entreprise",
    summary: "L'annuaire vérifié des entreprises de Mayotte, et l'espace où chaque entreprise tient sa fiche.",
    details:
      "Les fiches relevées par l'équipe GROUPE BTM (vrai numéro, adresse, horaires, date d'ouverture…) : Tamilya les donne en priorité, avec leur source. Une entreprise qui prend la main sur sa fiche (/entreprise) la modifie sans validation, voit combien de fois on l'a demandée et relie son widget Tamilya.",
    settings: "/admin/entreprises",
    default: false,
  },
  {
    id: "attestation",
    label: "Attestation d'hébergement",
    summary: "Remplir une attestation d'hébergement.",
    default: true,
  },
  {
    id: "signature",
    label: "Signer ou remplir un document",
    summary: "Signer un PDF ou un Word, ou remplir ses cases vides.",
    details: "Tamilya pose la signature de la personne sur un PDF ou un Word, ou remplit ses cases vides. Le document reste sur l'appareil ; seuls les noms des cases partent à Gemini.",
    default: false,
  },
  {
    id: "livres",
    label: "Livres lus par Tamilya",
    summary: "Un PDF lu en entier à voix haute, en 3D.",
    details: "Un PDF lu en entier, en 3D. Sorti du + le 2026-11-10 : plus d'entrée dans le site pour l'instant. Coûte des appels Gemini à chaque morceau (~4 min d'écoute).",
    costly: true,
    default: false,
  },
  {
    id: "devis",
    label: "Devis BTM",
    summary: "Devis de matériaux, choix du fournisseur et code de retrait.",
    details: "Le devis de matériaux (mur, dalle…), le choix du fournisseur et le code de retrait, quand on le demande à Tamilya.",
    default: true,
  },
  {
    id: "trajet",
    label: "Trajets",
    summary: "Le temps de trajet en voiture, en taxi et à pied, sur une carte.",
    details: "La carte du trajet (« combien de temps de chez moi à la CSSM ») avec les temps en voiture, en taxi et à pied.",
    default: true,
  },
  {
    id: "code",
    label: "Code de la route",
    summary: "Les créneaux de l'examen du code et la réservation d'une place.",
    details: "Les créneaux de l'examen du code et la réservation d'une place, depuis la conversation.",
    restricted: "La Poste n'a pas encore donné son accord pour réserver l'examen du code depuis Tamilya.",
    default: true,
  },
  {
    id: "chanson",
    label: "Chansons",
    summary: "Tamilya écrit une chanson et la chante avec des instruments.",
    details: "« Chante-moi quelque chose » : Tamilya écrit une chanson, chantée avec des instruments sous son message.",
    default: true,
  },
  {
    id: "youtube",
    label: "Vidéos YouTube",
    summary: "Tamilya propose des vidéos quand ça aide : recette, tutoriel, musique.",
    details: "Tamilya propose des recherches YouTube (recette, tutoriel, musique) quand une vidéo aiderait.",
    default: true,
  },
  {
    id: "repas",
    label: "Commande de repas",
    summary: "Commander à manger, seul ou en panier groupé.",
    details: "Commander à manger depuis la conversation, seul ou en panier groupé. Éteinte : les administrateurs l'ont seulement en mode démo.",
    restricted: "Les restaurants de la démo sont de vrais restaurants (démarchage de Jeje Livraison), qui n'ont pas donné leur accord.",
    default: false,
  },
  {
    id: "barge",
    label: "Tickets de barge",
    summary: "Acheter un ticket de barge pour Petite-Terre.",
    details: "Acheter un ticket de barge pour Petite-Terre depuis la conversation. Éteinte : les administrateurs l'ont seulement en mode démo.",
    restricted: "Le gestionnaire des barges n'a pas encore donné son accord pour vendre les tickets depuis Tamilya.",
    default: false,
  },
  {
    id: "portefeuille",
    label: "Portefeuille",
    summary: "Le solde, la recharge et le code de paiement.",
    details: "Le solde, la recharge et le code de paiement (Paramètres → Portefeuille).",
    default: false,
  },
  {
    id: "vocal",
    label: "Vocal en direct",
    summary: "Parler à Tamilya à voix haute, comme au téléphone.",
    details: "Parler à Tamilya à voix haute dans la conversation, comme au téléphone. Coûte des appels Gemini Live à chaque minute.",
    costly: true,
    default: false,
  },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];

/**
 * Fiche d'une fonctionnalité : phrase courte, détails cachés, coût, page de réglages éventuelle.
 * restricted : pas encore le droit de l'ouvrir au public (la raison) ; l'allumer demande une confirmation.
 */
export type FeatureInfo = {
  id: FeatureId;
  label: string;
  summary: string;
  details?: string;
  costly?: boolean;
  restricted?: string;
  settings?: string;
  default: boolean;
};

export const FEATURE_INFO = Object.fromEntries(FEATURES.map((f) => [f.id, f as FeatureInfo])) as Record<FeatureId, FeatureInfo>;

/** Rangement de la page /admin/fonctionnalites : chaque fonctionnalité dans un seul thème. */
export const FEATURE_GROUPS: { id: string; label: string; features: FeatureId[] }[] = [
  { id: "pratique", label: "Vie pratique", features: ["eau", "cyclone", "trajet", "entreprises", "attestation"] },
  { id: "emploi", label: "Emploi et formation", features: ["emploi", "candidatures", "evenements", "code"] },
  { id: "documents", label: "Documents", features: ["documents", "signature", "livres"] },
  { id: "achats", label: "Achats et paiements", features: ["devis", "repas", "barge", "portefeuille"] },
  { id: "loisirs", label: "Loisirs", features: ["chanson", "youtube"] },
  { id: "voix", label: "Voix", features: ["vocal"] },
];
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

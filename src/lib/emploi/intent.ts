/**
 * Offres d'emploi demandées (« montre-moi les offres d'emploi », « qui recrute à Koungou ? ») :
 * lu par le serveur sur le message. Le bloc ```offres-emploi``` ouvre, dans la conversation,
 * toutes les offres de Mayotte publiées sur France Travail (recherche, contrat, commune).
 */

/** Bloc remplacé dans la conversation par la liste des offres (JobsCard). */
export const JOBS_BLOCK = "offres-emploi";

/** Filtres de départ de la liste : un métier ou un mot (« infirmier »), une commune (« Koungou »). */
export type JobsSpec = { metier: string; ville: string };

/** Contenu du bloc : une ligne par filtre, vide si rien n'est demandé. */
export const jobsBlock = (spec: Partial<JobsSpec> = {}) =>
  `\n\n\`\`\`${JOBS_BLOCK}\nmetier: ${spec.metier?.trim() ?? ""}\nville: ${spec.ville?.trim() ?? ""}\n\`\`\``;

/** Filtres lus dans le bloc (« metier: … », « ville: … ») ; une ligne absente vaut vide. */
export function jobsSpecOf(text: string): JobsSpec {
  const read = (key: string) => {
    const value = text.match(new RegExp(`^[ \\t]*${key}[ \\t]*:[ \\t]*(.*)$`, "im"))?.[1]?.trim().slice(0, 60) ?? "";
    // Modèle recopié tel quel (« <métier cherché ou rien> », « rien », « aucun ») : pas de filtre.
    return /^<|^(?:rien|aucun|aucune|tous|toutes|-)$/i.test(value) ? "" : value;
  };
  return { metier: read("metier"), ville: read("ville") };
}

/** Minuscules sans accents, mots séparés par une espace, encadrés d'espaces. */
export const normalizeJobs = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;

const WORK = "(?:emplois?|travail|taf|boulots?|jobs?|stages?|alternances?|cdi|cdd|interim|missions?)";

/**
 * Demande de voir des offres, pas une simple phrase sur le travail (« mon travail me fatigue ») :
 * offres d'emploi, chercher du travail, postes à pourvoir, qui recrute, les emplois…
 */
const ASK_JOBS = new RegExp(
  [
    `\\boffres? (?:d |de |du )?${WORK}\\b`,
    `\\boffres? (?:a|sur) (?:france travail|pole emploi)\\b`,
    `\\b(?:cherch\\w*|recherch\\w*|trouv\\w*|veux|voudrais|besoin d) (?:du |un |une |de |d )?${WORK}\\b`,
    `\\bpostes? (?:actuels?|actuellement|disponibles?|libres?|ouverts?|vacants?|a pourvoir|en cours)\\b`,
    `\\b(?:les|des|tous les|toutes les) (?:postes|emplois|jobs|boulots|offres)\\b`,
    `\\b(?:qui|ca|il y a|y a t il|on) (?:recrute|recrutent|embauche|embauchent)\\b`,
    `\\brecrutements?\\b`,
    `\\b(?:ou|y a|il y a) (?:du |de |des )${WORK}\\b`,
  ].join("|"),
);

/** La personne veut voir des offres d'emploi. */
export const detectJobs = (message: string) => ASK_JOBS.test(normalizeJobs(message));

/** Les 17 communes de Mayotte, telles que France Travail les écrit (sans accents, en minuscules). */
const COMMUNES: [RegExp, string][] = [
  [/\bacoua\b/, "Acoua"],
  [/\bbandraboua\b/, "Bandraboua"],
  [/\bbandrele\b/, "Bandrele"],
  [/\bboueni\b/, "Boueni"],
  [/\bchiconi\b/, "Chiconi"],
  [/\bchirongui\b/, "Chirongui"],
  [/\bdembeni\b/, "Dembeni"],
  [/\b(?:dzaoudzi|labattoir)\b/, "Dzaoudzi"],
  [/\bkani k?eli\b/, "Kani-Keli"],
  [/\bkoungou\b/, "Koungou"],
  [/\b(?:mamoudzou|kaweni|cavani|mtsapere|passamainty|tsoundzou)\b/, "Mamoudzou"],
  [/\bmtsamboro\b/, "Mtsamboro"],
  [/\bm ?tsangamouji\b/, "Mtsangamouji"],
  [/\bouangani\b/, "Ouangani"],
  [/\bpamandzi\b/, "Pamandzi"],
  [/\bsada\b/, "Sada"],
  [/\btsingoni\b/, "Tsingoni"],
];

/** Commune nommée dans le message (« à Koungou »), sinon vide. Petite-Terre : Dzaoudzi et Pamandzi, on laisse vide. */
export function jobsTownFor(message: string): string {
  const text = normalizeJobs(message);
  return COMMUNES.find(([pattern]) => pattern.test(text))?.[1] ?? "";
}

/* -------------------------------------------------------------------------- */
/* Données envoyées à la liste                                                */
/* -------------------------------------------------------------------------- */

/** Famille de contrat, pour les filtres : CDI, CDD, intérim, ou autre (saisonnier, libéral…). */
export type JobContract = "CDI" | "CDD" | "MIS" | "AUTRE";

export type JobOffer = {
  id: string;
  title: string;
  company: string | null;
  /** Commune, en clair (« Mamoudzou »). */
  place: string | null;
  /** Libellé du contrat (« Contrat à durée indéterminée »). */
  contract: string | null;
  kind: JobContract;
  /** Temps de travail (« Temps plein »). */
  hours: string | null;
  salary: string | null;
  /** Métier selon France Travail (« Aide-soignant / Aide-soignante »). */
  job: string | null;
  /** Publication, heure ISO. */
  date: string | null;
  link: string;
};

export type JobsResponse =
  | { configured: true; offers: JobOffer[]; total: number; updatedAt: string }
  | { configured: false }
  | { error: string };

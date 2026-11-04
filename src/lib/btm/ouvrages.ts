/**
 * Devis BTM (btm.yt, la plateforme bâtiment de GROUPE BTM) faits dans la
 * conversation de Tamilya. Mêmes ouvrages, mêmes formules et mêmes prix que le
 * calculateur de btm.yt (src/services/calculs/ et src/donnees/typesProjets.js
 * du site) : un devis fait ici donne exactement le même total que là-bas.
 * Le résultat a la forme d'un projet de btm.yt, pour y être enregistré tel quel.
 */

export const OUVRAGE_IDS = ["mur", "dalle", "fondation", "terrasse", "carrelage"] as const;
export type OuvrageId = (typeof OUVRAGE_IDS)[number];

export type Champ =
  | { nom: string; label: string; type: "nombre"; unite: "m" | "cm" | "m²"; min: number; max: number; exemple: string; optionnel?: boolean; aide?: string }
  | { nom: string; label: string; type: "choix"; options: { valeur: string; label: string }[]; defaut: string };

export type Ouvrage = {
  id: OuvrageId;
  libelle: string;
  emoji: string;
  accroche: string;
  champs: Champ[];
  parametres: Record<string, number>;
};

export const OUVRAGES: readonly Ouvrage[] = [
  {
    id: "mur",
    libelle: "Mur",
    emoji: "🧱",
    accroche: "Parpaings, ciment, sable",
    champs: [
      { nom: "longueur", label: "Longueur du mur", type: "nombre", unite: "m", min: 0.1, max: 200, exemple: "10" },
      { nom: "hauteur", label: "Hauteur du mur", type: "nombre", unite: "m", min: 0.1, max: 20, exemple: "2,5" },
      { nom: "ouvertures", label: "Portes et fenêtres", type: "nombre", unite: "m²", min: 0, max: 4000, exemple: "0", optionnel: true, aide: "0 s'il n'y en a pas" },
    ],
    parametres: { surfaceParpaing: 0.08, margeParpaing: 1.05, m2ParSacCiment: 2.5, m2ParM3Sable: 10 },
  },
  {
    id: "dalle",
    libelle: "Dalle",
    emoji: "⬛",
    accroche: "Béton, ferraillage, gravier",
    champs: [
      { nom: "longueur", label: "Longueur", type: "nombre", unite: "m", min: 0.1, max: 200, exemple: "8" },
      { nom: "largeur", label: "Largeur", type: "nombre", unite: "m", min: 0.1, max: 200, exemple: "6" },
      { nom: "epaisseur", label: "Épaisseur", type: "nombre", unite: "cm", min: 5, max: 60, exemple: "12", aide: "Abri : 10 cm · garage : 12 à 15 cm" },
    ],
    parametres: { densiteBeton: 2.4, kgFerParM2: 5, tonnesGravierParM3: 0.8 },
  },
  {
    id: "fondation",
    libelle: "Fondation",
    emoji: "⛰️",
    accroche: "Semelles en béton armé",
    champs: [
      { nom: "longueur", label: "Longueur des tranchées", type: "nombre", unite: "m", min: 0.1, max: 500, exemple: "30", aide: "Le tour de la maison et les murs intérieurs" },
      { nom: "largeur", label: "Largeur de la tranchée", type: "nombre", unite: "m", min: 0.1, max: 5, exemple: "0,5" },
      { nom: "profondeur", label: "Profondeur", type: "nombre", unite: "m", min: 0.1, max: 5, exemple: "0,6" },
    ],
    parametres: { densiteBeton: 2.4, kgAcierParM3: 50 },
  },
  {
    id: "terrasse",
    libelle: "Terrasse",
    emoji: "☀️",
    accroche: "Dalle en béton lissé",
    champs: [
      { nom: "longueur", label: "Longueur", type: "nombre", unite: "m", min: 0.1, max: 200, exemple: "6" },
      { nom: "largeur", label: "Largeur", type: "nombre", unite: "m", min: 0.1, max: 200, exemple: "4" },
      { nom: "epaisseur", label: "Épaisseur", type: "nombre", unite: "cm", min: 5, max: 60, exemple: "10", aide: "En général 10 cm" },
    ],
    parametres: { densiteBeton: 2.4, kgFerParM2: 5, tonnesGravierParM3: 0.8 },
  },
  {
    id: "carrelage",
    libelle: "Carrelage",
    emoji: "🔲",
    accroche: "Carreaux, colle, joints",
    champs: [
      { nom: "longueur", label: "Longueur de la pièce", type: "nombre", unite: "m", min: 0.1, max: 200, exemple: "5" },
      { nom: "largeur", label: "Largeur de la pièce", type: "nombre", unite: "m", min: 0.1, max: 200, exemple: "4" },
      {
        nom: "format",
        label: "Taille des carreaux",
        type: "choix",
        defaut: "60x60",
        options: [
          { valeur: "30x30", label: "30 × 30 cm" },
          { valeur: "45x45", label: "45 × 45 cm" },
          { valeur: "60x60", label: "60 × 60 cm" },
        ],
      },
    ],
    parametres: { margeCarreaux: 1.1, kgColleParM2: 5, kgParSacColle: 25, kgJointParM2: 0.5 },
  },
];

export const isOuvrageId = (value: unknown): value is OuvrageId => typeof value === "string" && (OUVRAGE_IDS as readonly string[]).includes(value);
export const trouverOuvrage = (id: string) => OUVRAGES.find((o) => o.id === id) ?? null;

export type Materiau = { id: string; libelle: string; unite: string; prixUnitaire: number };
export type Catalogue = Record<string, Materiau>;

/** Prix de repli de btm.yt (src/donnees/materiaux.js), quand la base de BTM ne répond pas. */
export const CATALOGUE_LOCAL: Catalogue = {
  parpaing: { id: "parpaing", libelle: "Parpaing 20×20×40 cm", unite: "u", prixUnitaire: 1.9 },
  ciment: { id: "ciment", libelle: "Ciment gris (sac 35 kg)", unite: "sac", prixUnitaire: 12.5 },
  sable: { id: "sable", libelle: "Sable de construction", unite: "m³", prixUnitaire: 95 },
  beton: { id: "beton", libelle: "Béton prêt à l’emploi", unite: "t", prixUnitaire: 145 },
  beton_arme: { id: "beton_arme", libelle: "Béton armé (fondations)", unite: "t", prixUnitaire: 155 },
  ferraillage: { id: "ferraillage", libelle: "Treillis soudé / ferraillage", unite: "kg", prixUnitaire: 2.2 },
  acier: { id: "acier", libelle: "Armatures acier HA", unite: "kg", prixUnitaire: 2.6 },
  gravier: { id: "gravier", libelle: "Gravier concassé", unite: "t", prixUnitaire: 85 },
  beton_lisse: { id: "beton_lisse", libelle: "Finition béton lissé", unite: "m²", prixUnitaire: 15 },
  carrelage_sol: { id: "carrelage_sol", libelle: "Carrelage de sol intérieur", unite: "m²", prixUnitaire: 30 },
  colle_carrelage: { id: "colle_carrelage", libelle: "Colle à carrelage (sac 25 kg)", unite: "sac", prixUnitaire: 16 },
  joint_carrelage: { id: "joint_carrelage", libelle: "Mortier joint carrelage", unite: "kg", prixUnitaire: 3.5 },
};

/** Prix et constantes à jour de btm.yt (modifiables par son administrateur). */
export type PrixBtm = { catalogue: Catalogue; parametres: Partial<Record<OuvrageId, Record<string, number>>>; source: "btm" | "local" };

export const PRIX_LOCAUX: PrixBtm = { catalogue: CATALOGUE_LOCAL, parametres: {}, source: "local" };

export type Ligne = { id: string; libelle: string; unite: string; quantite: number; prixUnitaire: number; sousTotal: number };
export type Mesure = { label: string; valeur: number | string; unite: string; principale?: boolean };

/** Même forme que le « resultat » d'un projet de btm.yt. */
export type ResultatDevis = {
  type: OuvrageId;
  typeLibelle: string;
  dimensions: Record<string, number | string>;
  calculeLe: string;
  mesures: Mesure[];
  lignes: Ligne[];
  totalMateriaux: number;
  total: number;
};

export const arrondi = (n: number, decimales = 2) => {
  const f = 10 ** decimales;
  return Math.round((Number(n) + Number.EPSILON) * f) / f;
};

/** « 2,5 », « 2.5 », 2.5 → 2.5 ; vide ou illisible → NaN. */
export function lireNombre(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

const nf = (n: number, decimales = 2) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimales }).format(n);

/**
 * Dimensions lues et vérifiées. `erreurs` est indexé par nom de champ ; un champ
 * optionnel vide vaut 0 (mur sans porte ni fenêtre).
 */
export function validerValeurs(ouvrage: Ouvrage, valeurs: Record<string, unknown>) {
  const dimensions: Record<string, number | string> = {};
  const erreurs: Record<string, string> = {};
  for (const champ of ouvrage.champs) {
    const brut = valeurs[champ.nom];
    if (champ.type === "choix") {
      dimensions[champ.nom] = champ.options.some((o) => o.valeur === brut) ? String(brut) : champ.defaut;
      continue;
    }
    const vide = brut === undefined || brut === null || String(brut).trim() === "";
    if (vide) {
      if (champ.optionnel) dimensions[champ.nom] = 0;
      else erreurs[champ.nom] = "À remplir";
      continue;
    }
    const n = lireNombre(brut);
    if (!Number.isFinite(n) || (champ.optionnel ? n < 0 : n <= 0)) erreurs[champ.nom] = "Un nombre supérieur à 0";
    else if (n < champ.min && !(champ.optionnel && n === 0)) erreurs[champ.nom] = `Au moins ${nf(champ.min)} ${champ.unite}`;
    else if (n > champ.max) erreurs[champ.nom] = `Au plus ${nf(champ.max)} ${champ.unite}`;
    else dimensions[champ.nom] = arrondi(n, 3);
  }
  if (ouvrage.id === "mur" && !erreurs.longueur && !erreurs.hauteur && !erreurs.ouvertures) {
    const surface = Number(dimensions.longueur) * Number(dimensions.hauteur);
    if (Number(dimensions.ouvertures) >= surface) erreurs.ouvertures = "Plus grand que le mur";
  }
  return { dimensions, erreurs, valide: Object.keys(erreurs).length === 0 };
}

function ligne(catalogue: Catalogue, id: string, quantite: number, decimales = 2): Ligne {
  const m = catalogue[id] ?? CATALOGUE_LOCAL[id];
  if (!m) throw new Error(`Matériau inconnu : ${id}`);
  const q = arrondi(quantite, decimales);
  return { id, libelle: m.libelle, unite: m.unite, quantite: q, prixUnitaire: m.prixUnitaire, sousTotal: arrondi(q * m.prixUnitaire) };
}

function baseDalle(d: Record<string, number | string>, p: Record<string, number>, catalogue: Catalogue) {
  const surface = Number(d.longueur) * Number(d.largeur);
  const volume = surface * (Number(d.epaisseur) / 100);
  const tonnesBeton = volume * p.densiteBeton;
  return {
    surface,
    lignes: [
      ligne(catalogue, "beton", tonnesBeton, 2),
      ligne(catalogue, "ferraillage", surface * p.kgFerParM2, 1),
      ligne(catalogue, "gravier", volume * p.tonnesGravierParM3, 2),
    ],
    mesures: [
      { label: "Surface", valeur: arrondi(surface), unite: "m²", principale: true },
      { label: "Volume de béton", valeur: arrondi(volume, 3), unite: "m³" },
      { label: "Poids de béton", valeur: arrondi(tonnesBeton, 2), unite: "t" },
    ] as Mesure[],
  };
}

const FORMATS: Record<string, number> = { "30x30": 0.3, "45x45": 0.45, "60x60": 0.6 };

const FORMULES: Record<OuvrageId, (d: Record<string, number | string>, p: Record<string, number>, c: Catalogue) => { mesures: Mesure[]; lignes: Ligne[] }> = {
  mur(d, p, c) {
    const brute = Number(d.longueur) * Number(d.hauteur);
    const ouvertures = Number(d.ouvertures) || 0;
    const nette = Math.max(0, brute - ouvertures);
    return {
      mesures: [
        { label: "Surface brute", valeur: arrondi(brute), unite: "m²" },
        { label: "Ouvertures", valeur: arrondi(ouvertures), unite: "m²" },
        { label: "Surface nette", valeur: arrondi(nette), unite: "m²", principale: true },
      ],
      lignes: [
        ligne(c, "parpaing", Math.ceil((nette / p.surfaceParpaing) * p.margeParpaing), 0),
        ligne(c, "ciment", Math.ceil(nette / p.m2ParSacCiment), 0),
        ligne(c, "sable", nette / p.m2ParM3Sable, 2),
      ],
    };
  },
  dalle(d, p, c) {
    const b = baseDalle(d, p, c);
    return { mesures: b.mesures, lignes: b.lignes };
  },
  fondation(d, p, c) {
    const volume = Number(d.longueur) * Number(d.largeur) * Number(d.profondeur);
    const tonnesBeton = volume * p.densiteBeton;
    return {
      mesures: [
        { label: "Volume des fouilles", valeur: arrondi(volume, 3), unite: "m³", principale: true },
        { label: "Poids de béton", valeur: arrondi(tonnesBeton, 2), unite: "t" },
      ],
      lignes: [ligne(c, "beton_arme", tonnesBeton, 2), ligne(c, "acier", volume * p.kgAcierParM3, 1)],
    };
  },
  terrasse(d, p, c) {
    const b = baseDalle(d, p, c);
    return {
      mesures: [...b.mesures, { label: "Finition", valeur: "Béton lissé", unite: "" }],
      lignes: [...b.lignes, ligne(c, "beton_lisse", b.surface, 2)],
    };
  },
  carrelage(d, p, c) {
    const surface = Number(d.longueur) * Number(d.largeur);
    const format = FORMATS[String(d.format)] ? String(d.format) : "60x60";
    const m2Carreaux = surface * p.margeCarreaux;
    const nbCarreaux = Math.ceil(m2Carreaux / FORMATS[format] ** 2);
    return {
      mesures: [
        { label: "Surface", valeur: arrondi(surface), unite: "m²", principale: true },
        { label: "Carreaux à commander", valeur: arrondi(m2Carreaux), unite: "m²" },
        { label: `Nombre de carreaux (${format.replace("x", " × ")} cm)`, valeur: nbCarreaux, unite: "" },
      ],
      lignes: [
        ligne(c, "carrelage_sol", m2Carreaux, 2),
        ligne(c, "colle_carrelage", Math.ceil((surface * p.kgColleParM2) / p.kgParSacColle), 0),
        ligne(c, "joint_carrelage", surface * p.kgJointParM2, 1),
      ],
    };
  },
};

/** Constantes de l'ouvrage, avec celles réglées sur btm.yt (seulement les clés connues, en nombres). */
function parametresDe(ouvrage: Ouvrage, prix: PrixBtm) {
  const p = { ...ouvrage.parametres };
  for (const [k, v] of Object.entries(prix.parametres[ouvrage.id] ?? {})) {
    if (k in p && Number.isFinite(v) && v > 0) p[k] = v;
  }
  return p;
}

/**
 * Calcule le devis ; null si les dimensions ne sont pas valables (voir validerValeurs).
 * Le carrelage est chiffré au prix moyen du carrelage de sol : le modèle de
 * carreaux se choisit ensuite sur btm.yt, chez le fournisseur.
 */
export function calculerDevis(type: OuvrageId, valeurs: Record<string, unknown>, prix: PrixBtm = PRIX_LOCAUX): ResultatDevis | null {
  const ouvrage = trouverOuvrage(type);
  if (!ouvrage) return null;
  const { dimensions, valide } = validerValeurs(ouvrage, valeurs);
  if (!valide) return null;
  if (type === "carrelage") dimensions.carreau = "standard";
  const { mesures, lignes } = FORMULES[type](dimensions, parametresDe(ouvrage, prix), prix.catalogue);
  const totalMateriaux = arrondi(lignes.reduce((s, l) => s + l.sousTotal, 0));
  return { type, typeLibelle: ouvrage.libelle, dimensions, calculeLe: new Date().toISOString(), mesures, lignes, totalMateriaux, total: totalMateriaux };
}

/** « 8 m × 6 m × 12 cm » (sans les champs optionnels laissés à 0). */
export function resumerMesures(type: OuvrageId, dimensions: Record<string, unknown>) {
  const ouvrage = trouverOuvrage(type);
  if (!ouvrage) return "";
  return ouvrage.champs
    .filter((c) => c.type === "nombre" && dimensions[c.nom] !== undefined && !(c.optionnel && !Number(dimensions[c.nom])))
    .map((c) => `${nf(Number(dimensions[c.nom]), 3)} ${(c as { unite: string }).unite}`)
    .join(" × ");
}

/** Nom du projet enregistré sur btm.yt : « Dalle 8 m × 6 m × 12 cm (Tamilya) ». */
export const nomDevis = (r: ResultatDevis) => `${r.typeLibelle} ${resumerMesures(r.type, r.dimensions)} (Tamilya)`.slice(0, 120);

const UNITES_LETTRES: Record<string, [string, string]> = { u: ["unité", "unités"], sac: ["sac", "sacs"], t: ["tonne", "tonnes"] };

/** « 13 sacs », « 1,5 tonne », « 3,2 m³ » */
export function formaterQuantite(quantite: number, unite: string) {
  const mots = UNITES_LETTRES[unite];
  return mots ? `${nf(quantite)} ${quantite >= 2 ? mots[1] : mots[0]}` : `${nf(quantite)} ${unite}`;
}

export const formaterEurosDevis = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(n);

export const BTM_SITE = "https://www.btm.yt";

/** Lien qui ouvre le calculateur de btm.yt avec ce devis déjà rempli. */
export function lienCalculateur(type: OuvrageId, dimensions: Record<string, unknown>) {
  const ouvrage = trouverOuvrage(type);
  const params = new URLSearchParams({ type });
  for (const c of ouvrage?.champs ?? []) {
    const v = dimensions[c.nom];
    if (v !== undefined && v !== "") params.set(c.nom, String(v));
  }
  return `${BTM_SITE}/calculateur?${params.toString()}`;
}

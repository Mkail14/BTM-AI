/** Champs de l'attestation : uniquement ce que le modèle demande. */

export type Civilite = "M." | "Mme";

export type AttestationFields = {
  hebergeantNom: string;
  hebergeantPrenom: string;
  hebergeantNaissanceDate: string;
  hebergeantNaissanceLieu: string;
  adresse: string;
  codePostal: string;
  ville: string;
  civilite: Civilite | "";
  hebergeNom: string;
  hebergePrenom: string;
  hebergeNaissanceDate: string;
  hebergeNaissanceLieu: string;
  depuis: string;
  faitA: string;
  faitLe: string;
};

export const EMPTY_FIELDS: AttestationFields = {
  hebergeantNom: "",
  hebergeantPrenom: "",
  hebergeantNaissanceDate: "",
  hebergeantNaissanceLieu: "",
  adresse: "",
  codePostal: "",
  ville: "",
  civilite: "",
  hebergeNom: "",
  hebergePrenom: "",
  hebergeNaissanceDate: "",
  hebergeNaissanceLieu: "",
  depuis: "",
  faitA: "",
  faitLe: "",
};

const LIMITS: Partial<Record<keyof AttestationFields, number>> = { adresse: 160 };
const MAX_LENGTH = 80;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** « 2026-11-05 » → « 05 / 11 / 2026 », comme sur le modèle. */
export function dateFr(iso: string) {
  const m = ISO.exec(iso);
  return m ? `${m[3]} / ${m[2]} / ${m[1]}` : "";
}

const realDate = (iso: string) => {
  const m = ISO.exec(iso);
  if (!m) return false;
  const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[3];
};

/** Erreurs par champ, en français simple. Aucune erreur : le document peut être préparé. */
export function checkFields(f: AttestationFields, today: string) {
  const errors: Partial<Record<keyof AttestationFields, string>> = {};
  for (const key of Object.keys(EMPTY_FIELDS) as (keyof AttestationFields)[]) {
    const value = f[key].trim();
    if (!value) errors[key] = "À remplir";
    else if (value.length > (LIMITS[key] ?? MAX_LENGTH)) errors[key] = "Trop long";
  }
  if (f.codePostal.trim() && !/^\d{5}$/.test(f.codePostal.trim())) errors.codePostal = "5 chiffres";

  const past: (keyof AttestationFields)[] = ["hebergeantNaissanceDate", "hebergeNaissanceDate", "depuis", "faitLe"];
  for (const key of past) {
    if (!f[key]) continue;
    if (!realDate(f[key])) errors[key] = "Date incorrecte";
    else if (f[key] > today) errors[key] = "Date dans le futur";
  }
  if (!errors.depuis && f.hebergeNaissanceDate && f.depuis && f.depuis < f.hebergeNaissanceDate) {
    errors.depuis = "Avant sa naissance";
  }
  return errors;
}

/** Date du jour à Mayotte, au format des champs date. */
export const todayMayotte = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mayotte", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

import type { AttestationFields, Civilite } from "./fields";

/** Ce que le compte connaît déjà de la personne (dernière réservation du code et profil). */
export type AttestationPrefill = {
  civility?: string;
  lastName?: string;
  firstName?: string;
  birthDate?: string;
  address?: string;
  postalCode?: string;
  city?: string;
};

export type AttestationRole = "hebergeant" | "heberge";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** « Amina Madi Said » → prénom « Amina », nom « Madi Said ». Un seul mot reste un prénom. */
export function splitDisplayName(name: string): { firstName?: string; lastName?: string } {
  const [firstName, ...rest] = name.trim().split(/\s+/).filter(Boolean);
  return { firstName, lastName: rest.join(" ") || undefined };
}

/** « 12 rue du Lagon, 97600 Mamoudzou » → rue et code postal à part (s'il y en a un). */
export function splitAddressLine(line: string): { address?: string; postalCode?: string } {
  const postalCode = /\b976\d{2}\b/.exec(line)?.[0];
  const address = line
    .replace(/\b976\d{2}\b.*$/, "")
    .replace(/[\s,]+$/, "")
    .trim();
  return { address: address || undefined, postalCode };
}

/**
 * Remplit le côté de la personne avec son compte. Seulement les cases vides :
 * ce qu'elle a déjà écrit ne bouge pas. L'adresse vaut pour les deux rôles,
 * puisque la personne hébergée habite chez l'hébergeant.
 */
export function applyPrefill(fields: AttestationFields, role: AttestationRole, known: AttestationPrefill): AttestationFields {
  const next = { ...fields };
  const fill = (key: keyof AttestationFields, value: string | undefined) => {
    if (value && !next[key]) (next as Record<keyof AttestationFields, string>)[key] = value;
  };
  const birthDate = known.birthDate && ISO_DATE.test(known.birthDate) ? known.birthDate : undefined;
  if (role === "hebergeant") {
    fill("hebergeantNom", known.lastName);
    fill("hebergeantPrenom", known.firstName);
    fill("hebergeantNaissanceDate", birthDate);
  } else {
    fill("hebergeNom", known.lastName);
    fill("hebergePrenom", known.firstName);
    fill("hebergeNaissanceDate", birthDate);
    const civility: Civilite | undefined = known.civility === "M." || known.civility === "Mme" ? known.civility : undefined;
    fill("civilite", civility);
  }
  fill("adresse", known.address);
  fill("codePostal", known.postalCode);
  fill("ville", known.city);
  fill("faitA", known.city);
  return next;
}

/**
 * Prévenir les comptes dont l'adresse a pu être abîmée à l'inscription.
 *
 * Du 2026-11-02 (commit 83e3bd8) à la correction (e9a6b3d), l'adresse donnée à
 * l'inscription voyait chaque « s » minuscule remplacé par un espace (« rue des Roses » → « rue de Ro e »). Les lettres perdues ne
 * se devinent pas : on demande à la personne de vérifier (décision de
 * l'utilisateur, 2026-11-08 : « prévenir »).
 *
 * Concernés : adresse enregistrée à l'inscription pendant cette période, jamais
 * réenregistrée depuis, et sans aucun « s » minuscule (une adresse qui en contient
 * n'est pas passée par la faute). Le message disparaît dès que l'adresse est
 * réenregistrée dans Paramètres.
 */

/** Début de la faute (commit 83e3bd8, 2026-11-02 10:06 heure de Mayotte). */
export const ADDRESS_BUG_FROM = Date.parse("2026-11-02T07:00:00Z");
/**
 * Fin, large : la correction n'est en ligne qu'une fois poussée. Une adresse sans « s »
 * enregistrée après la mise en ligne reçoit au pire un rappel inutile.
 */
export const ADDRESS_BUG_UNTIL = Date.parse("2026-11-20T00:00:00Z");
/** Adresse réenregistrée plus tard que l'inscription : la personne l'a déjà revue. */
const SAME_AS_SIGNUP_MS = 10 * 60_000;

export type AddressProfile = {
  address_line?: unknown;
  address_updated_at?: unknown;
  created_at?: unknown;
};

export function needsAddressCheck(profile: AddressProfile | null | undefined): boolean {
  if (!profile || typeof profile.address_line !== "string" || !profile.address_line.trim()) return false;
  if (typeof profile.address_updated_at !== "string" || typeof profile.created_at !== "string") return false;
  const saved = Date.parse(profile.address_updated_at);
  const created = Date.parse(profile.created_at);
  if (Number.isNaN(saved) || Number.isNaN(created)) return false;
  if (saved < ADDRESS_BUG_FROM || saved >= ADDRESS_BUG_UNTIL) return false;
  if (Math.abs(saved - created) > SAME_AS_SIGNUP_MS) return false;
  return !profile.address_line.includes("s");
}

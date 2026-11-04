/**
 * Constantes et petites vérifications d'adresse utilisées dans le navigateur
 * (champs d'adresse, commande de repas), sans zod : la page n'embarque pas la
 * bibliothèque de validation pour si peu. Les schémas complets restent dans
 * lib/address.ts et lib/code-exam/candidate.ts, qui réexportent tout ceci.
 */

/** Les 17 communes de Mayotte, proposées dans le champ « Ville de résidence ». */
export const MAYOTTE_COMMUNES = [
  "Acoua",
  "Bandraboua",
  "Bandrélé",
  "Bouéni",
  "Chiconi",
  "Chirongui",
  "Dembéni",
  "Dzaoudzi",
  "Kani-Kéli",
  "Koungou",
  "Mamoudzou",
  "Mtsamboro",
  "M'Tsangamouji",
  "Ouangani",
  "Pamandzi",
  "Sada",
  "Tsingoni",
] as const;

export type GeoPoint = { lat: number; lng: number; accuracy: number };

/** Rectangle qui contient Grande-Terre et Petite-Terre (et un peu de lagon). */
const MAYOTTE_BOUNDS = { south: -13.05, north: -12.6, west: 44.95, east: 45.35 };

export function isInMayotte(lat: number, lng: number): boolean {
  return lat >= MAYOTTE_BOUNDS.south && lat <= MAYOTTE_BOUNDS.north && lng >= MAYOTTE_BOUNDS.west && lng <= MAYOTTE_BOUNDS.east;
}

/** Au-delà, la position ne désigne plus une maison (wifi ou antenne seule). */
export const MAX_GPS_ACCURACY_M = 500;

/** Message d'erreur de la position GPS du navigateur, en clair. */
export function geolocationErrorMessage(code: number): string {
  if (code === 1) return "Tu as refusé la localisation. Autorise-la dans ton navigateur, ou écris ton adresse.";
  if (code === 3) return "La localisation a pris trop de temps. Réessaie, ou écris ton adresse.";
  return "Position introuvable pour le moment. Écris ton adresse.";
}

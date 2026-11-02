import type { GeoPoint } from "@/lib/address";
import { COMMUNE_CENTERS, distanceKm as km, PETITE_TERRE, type Point } from "@/lib/geo/communes";

/**
 * Bureaux La Poste de Mayotte où l'on passe le code, et centre de chaque
 * commune : pour qu'Awa dise lequel est le plus proche de chez la personne,
 * sans afficher le tableau des horaires. Positions approximatives (centre du
 * village, voir src/lib/geo/communes.ts), suffisantes pour classer les bureaux.
 */

export const CODE_EXAM_OFFICES: readonly { name: string; commune: string; at: Point }[] = [
  { name: "Kaweni", commune: "Mamoudzou", at: { lat: -12.7586, lng: 45.2233 } },
  { name: "Mtsapere Mamoudzou", commune: "Mamoudzou", at: { lat: -12.795, lng: 45.215 } },
  { name: "Koungou", commune: "Koungou", at: { lat: -12.7336, lng: 45.2042 } },
  { name: "Combani", commune: "Tsingoni", at: { lat: -12.7811, lng: 45.1428 } },
  { name: "Dzoumogne", commune: "Bandraboua", at: { lat: -12.7158, lng: 45.1031 } },
  { name: "Dzaoudzi Labattoir", commune: "Dzaoudzi", at: { lat: -12.7836, lng: 45.2806 } },
  { name: "Pamandzi", commune: "Pamandzi", at: { lat: -12.7967, lng: 45.2797 } },
];

/**
 * Bureaux du plus proche au plus loin de l'adresse (position GPS si elle est
 * connue, sinon centre de la commune). Traverser le lagon (barge) compte
 * comme 15 km de plus. null si la commune est inconnue.
 */
export function officesByDistance(commune: string, geo: GeoPoint | null = null) {
  const from = geo ?? COMMUNE_CENTERS[commune];
  if (!from) return null;
  const petiteTerre = PETITE_TERRE.has(commune);
  return CODE_EXAM_OFFICES.map((office) => {
    const barge = PETITE_TERRE.has(office.commune) !== petiteTerre;
    return { ...office, km: Math.round(km(from, office.at)), barge, score: km(from, office.at) + (barge ? 15 : 0) };
  }).sort((a, b) => a.score - b.score);
}

/** Ligne donnée à Awa : « Kaweni (~3 km), Koungou (~5 km), … ». */
export function nearestOfficesLine(commune: string, geo: GeoPoint | null = null): string | null {
  const list = officesByDistance(commune, geo);
  if (!list) return null;
  return list.map((o) => `${o.name} (~${Math.max(1, o.km)} km${o.barge ? ", barge à prendre" : ""})`).join(", ");
}

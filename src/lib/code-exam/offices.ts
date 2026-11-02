import type { GeoPoint } from "@/lib/address";

/**
 * Bureaux La Poste de Mayotte où l'on passe le code, et centre de chaque
 * commune : pour qu'Awa dise lequel est le plus proche de chez la personne,
 * sans afficher le tableau des horaires. Positions approximatives (centre du
 * village), suffisantes pour classer les bureaux.
 */

type Point = { lat: number; lng: number };

/** Petite-Terre : séparée de Grande-Terre par la barge. */
const PETITE_TERRE = new Set(["Dzaoudzi", "Pamandzi"]);

export const CODE_EXAM_OFFICES: readonly { name: string; commune: string; at: Point }[] = [
  { name: "Kaweni", commune: "Mamoudzou", at: { lat: -12.7586, lng: 45.2233 } },
  { name: "Mtsapere Mamoudzou", commune: "Mamoudzou", at: { lat: -12.795, lng: 45.215 } },
  { name: "Koungou", commune: "Koungou", at: { lat: -12.7336, lng: 45.2042 } },
  { name: "Combani", commune: "Tsingoni", at: { lat: -12.7811, lng: 45.1428 } },
  { name: "Dzoumogne", commune: "Bandraboua", at: { lat: -12.7158, lng: 45.1031 } },
  { name: "Dzaoudzi Labattoir", commune: "Dzaoudzi", at: { lat: -12.7836, lng: 45.2806 } },
  { name: "Pamandzi", commune: "Pamandzi", at: { lat: -12.7967, lng: 45.2797 } },
];

const COMMUNE_CENTERS: Record<string, Point> = {
  Acoua: { lat: -12.7231, lng: 45.0611 },
  Bandraboua: { lat: -12.7008, lng: 45.1239 },
  Bandrélé: { lat: -12.9067, lng: 45.1917 },
  Bouéni: { lat: -12.9031, lng: 45.0786 },
  Chiconi: { lat: -12.8325, lng: 45.1144 },
  Chirongui: { lat: -12.9317, lng: 45.1497 },
  Dembéni: { lat: -12.8394, lng: 45.1897 },
  Dzaoudzi: { lat: -12.7878, lng: 45.2811 },
  "Kani-Kéli": { lat: -12.955, lng: 45.1003 },
  Koungou: { lat: -12.7336, lng: 45.2042 },
  Mamoudzou: { lat: -12.7806, lng: 45.2279 },
  Mtsamboro: { lat: -12.6997, lng: 45.0697 },
  "M'Tsangamouji": { lat: -12.7514, lng: 45.0858 },
  Ouangani: { lat: -12.8475, lng: 45.1375 },
  Pamandzi: { lat: -12.7967, lng: 45.2797 },
  Sada: { lat: -12.8486, lng: 45.1047 },
  Tsingoni: { lat: -12.7897, lng: 45.1075 },
};

/** Distance à vol d'oiseau, en km. */
function km(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

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

import { COMMUNE_CENTERS, distanceKm, type Point } from "@/lib/geo/communes";

/**
 * Trajet du livreur affiché sur la carte du suivi (utilisable côté navigateur).
 *
 * Démonstration : aucun livreur n'envoie sa position. Le restaurant est placé
 * dans sa commune, la livraison à la position GPS donnée (sinon dans la
 * commune), et le livreur avance le long d'une courbe entre les deux, au
 * rythme du suivi. Avec un vrai partenaire, sa position GPS remplacera
 * positionAt.
 */

export type { Point };

/** Nombre stable tiré d'un texte (même restaurant : même place sur la carte). */
function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

/** Décale un point de `km` dans la direction `turn` (0 à 1 = un tour). */
function shift(p: Point, km: number, turn: number): Point {
  const angle = turn * 2 * Math.PI;
  const dLat = (km / 111) * Math.cos(angle);
  const dLng = ((km / 111) * Math.sin(angle)) / Math.cos((p.lat * Math.PI) / 180);
  return { lat: p.lat + dLat, lng: p.lng + dLng };
}

const centerOf = (commune: string): Point => COMMUNE_CENTERS[commune] ?? COMMUNE_CENTERS.Mamoudzou;

/** Restaurant : dans sa commune, à moins de 600 m du centre. */
export function restaurantPoint(id: string, commune: string): Point {
  return shift(centerOf(commune), 0.2 + hash(id) * 0.4, hash(`${id}:a`));
}

/** Lieu de livraison : la position GPS, sinon la commune ; jamais collé au restaurant. */
export function deliveryPoint(seed: string, commune: string, geo: Point | null, from: Point): Point {
  const to = geo ?? shift(centerOf(commune), 0.3 + hash(seed) * 0.5, hash(`${seed}:a`));
  return distanceKm(from, to) < 0.8 ? shift(from, 1.2 + hash(seed) * 0.6, hash(`${seed}:b`)) : to;
}

/** Courbe de 32 points entre le restaurant et la livraison (un trajet plausible, pas une ligne droite). */
export function routePath(from: Point, to: Point, seed: string): Point[] {
  const bend = (hash(`${seed}:c`) - 0.5) * 0.5;
  const control = { lat: (from.lat + to.lat) / 2 - (to.lng - from.lng) * bend, lng: (from.lng + to.lng) / 2 + (to.lat - from.lat) * bend };
  return Array.from({ length: 32 }, (_, i) => {
    const t = i / 31;
    const u = 1 - t;
    return { lat: u * u * from.lat + 2 * u * t * control.lat + t * t * to.lat, lng: u * u * from.lng + 2 * u * t * control.lng + t * t * to.lng };
  });
}

/** Position sur le trajet, de 0 (restaurant) à 1 (arrivée), à distance égale le long de la courbe. */
export function positionAt(path: readonly Point[], progress: number): Point {
  const t = Math.min(1, Math.max(0, progress));
  const lengths = path.slice(1).map((p, i) => distanceKm(path[i], p));
  let left = t * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] || i === lengths.length - 1) {
      const k = lengths[i] ? Math.min(1, left / lengths[i]) : 0;
      return { lat: path[i].lat + (path[i + 1].lat - path[i].lat) * k, lng: path[i].lng + (path[i + 1].lng - path[i].lng) * k };
    }
    left -= lengths[i];
  }
  return path[path.length - 1];
}

/** Longueur du trajet en km. */
export const routeKm = (path: readonly Point[]) => path.slice(1).reduce((sum, p, i) => sum + distanceKm(path[i], p), 0);

/** Point le plus proche de `p` sur le trajet : index du segment, point projeté et distance en km. */
export function closestOnPath(path: readonly Point[], p: Point): { index: number; point: Point; km: number } {
  let best = { index: 0, point: path[0] ?? p, km: Infinity };
  // Projection à plat, suffisante à l'échelle d'une rue.
  const kx = Math.cos((p.lat * Math.PI) / 180);
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = (b.lng - a.lng) * kx;
    const dy = b.lat - a.lat;
    const len = dx * dx + dy * dy;
    const t = len ? Math.min(1, Math.max(0, (((p.lng - a.lng) * kx) * dx + (p.lat - a.lat) * dy) / len)) : 0;
    const q = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const km = distanceKm(p, q);
    if (km < best.km) best = { index: i, point: q, km };
  }
  return best;
}

/** Ce qui reste à parcourir depuis `p` : le trajet coupé au point le plus proche. */
export function remainingFrom(path: readonly Point[], p: Point): Point[] {
  if (path.length < 2) return [...path];
  const { index, point } = closestOnPath(path, p);
  return [point, ...path.slice(index + 1)];
}

/** Partie déjà faite du trajet, jusqu'à la part `progress` (0 à 1). */
export function travelledPart(path: readonly Point[], progress: number): Point[] {
  const t = Math.min(1, Math.max(0, progress));
  const lengths = path.slice(1).map((p, i) => distanceKm(path[i], p));
  let left = t * lengths.reduce((a, b) => a + b, 0);
  const out: Point[] = path.length ? [path[0]] : [];
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]) {
      out.push(positionAt(path.slice(i, i + 2), lengths[i] ? left / lengths[i] : 0));
      return out;
    }
    out.push(path[i + 1]);
    left -= lengths[i];
  }
  return out;
}

/** Au-delà de 60 m du trajet prévu, le livreur a pris un autre chemin : l'itinéraire est recalculé. */
export const OFF_ROUTE_KM = 0.06;

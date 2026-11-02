import "server-only";
import { isInMayotte } from "@/lib/address";
import { COMMUNE_CENTERS, type Point } from "@/lib/geo/communes";

/**
 * Place une adresse écrite sur la carte (« rue Cheick Boundjad Soulaimana,
 * Mamoudzou » → la vraie rue), avec Nominatim, la recherche d'adresses
 * d'OpenStreetMap (gratuite, sans clé). Introuvable : centre de la commune.
 * Dans les deux cas, le point est ensuite posé sur la route la plus proche
 * (OSRM), pour qu'il ne tombe jamais dans la mer ou au milieu d'un pâté de maisons.
 *
 * Règles de Nominatim : un nom d'application identifiable, une recherche à la
 * fois, résultats gardés en cache (30 jours ici).
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM_NEAREST = "https://router.project-osrm.org/nearest/v1/driving";
const USER_AGENT = "BTM-AI/1.0 (contact@btm.yt)";
const MONTH = 30 * 86_400;
// Rectangle de Mayotte : la recherche ne sort jamais de l'île.
const VIEWBOX = "44.95,-12.6,45.35,-13.05";

/** Premier résultat dans Mayotte ; `categories` : n'accepter que ces sortes de lieux (amenity pour un restaurant…). */
async function search(q: string, categories?: readonly string[]): Promise<Point | null> {
  const url = `${NOMINATIM}?format=jsonv2&limit=3&bounded=1&viewbox=${VIEWBOX}&accept-language=fr&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, next: { revalidate: MONTH }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const hits = (await res.json()) as { lat: string; lon: string; category: string }[];
    const hit = hits.find((h) => !categories || categories.includes(h.category));
    const p = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null;
    return p && isInMayotte(p.lat, p.lng) ? p : null;
  } catch {
    return null;
  }
}

/** Le point de route le plus proche (à 300 m au plus), sinon le point tel quel. */
export async function snapToRoad(p: Point): Promise<Point> {
  try {
    const res = await fetch(`${OSRM_NEAREST}/${p.lng.toFixed(6)},${p.lat.toFixed(6)}?number=1`, {
      next: { revalidate: MONTH },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return p;
    const body = (await res.json()) as { waypoints?: { location: [number, number]; distance: number }[] };
    const w = body.waypoints?.[0];
    return w && w.distance < 300 ? { lat: w.location[1], lng: w.location[0] } : p;
  } catch {
    return p;
  }
}

/**
 * Variantes de l'adresse, de la plus complète à la plus courte : avec la
 * commune, sans la commune, puis sans le repère (« près de la mosquée »).
 */
function queries(line: string, commune: string): string[] {
  const street = line.split(/,|\bprès\b|\bpres\b|\ben face\b|\bderrière\b|\bà côté\b/i)[0].trim();
  return [...new Set([`${line}, ${commune}`, line, street.length >= 5 ? `${street}, ${commune}` : "", street.length >= 5 ? street : ""])].filter(Boolean);
}

/** Point de livraison d'une adresse écrite, posé sur une route. */
export async function geocodeAddress(line: string, commune: string): Promise<{ point: Point; found: boolean }> {
  for (const q of queries(line, commune)) {
    const hit = await search(q);
    if (hit) return { point: await snapToRoad(hit), found: true };
  }
  return { point: await snapToRoad(COMMUNE_CENTERS[commune] ?? COMMUNE_CENTERS.Mamoudzou), found: false };
}

/** Restaurant : cherché par son nom dans sa commune, sinon à sa place par défaut (`fallback`) ; posé sur une route. */
export async function geocodePlace(name: string, commune: string, fallback: Point): Promise<Point> {
  // Seulement un commerce : un nom courant (« Le Snack ») ne doit pas tomber sur une rue ou un village.
  const hit = await search(`${name}, ${commune}`, ["amenity", "shop", "tourism"]);
  return snapToRoad(hit ?? fallback);
}

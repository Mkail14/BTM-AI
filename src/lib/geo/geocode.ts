import "server-only";
import { isInMayotte } from "@/lib/address";
import { COMMUNE_CENTERS, distanceKm, type Point } from "@/lib/geo/communes";

/**
 * Place une adresse écrite sur la carte (« rue Cheick Boundjad Soulaimana,
 * Mamoudzou » → la vraie rue). D'abord la Base Adresse Nationale (annuaire
 * officiel de l'État, gratuit, sans clé), qui connaît des rues de Mayotte
 * absentes d'OpenStreetMap et de Google (ex. boulevard Tsiveré à Koungou) ;
 * puis Nominatim (OpenStreetMap). Introuvable : centre de la commune.
 * Dans les deux cas, le point est ensuite posé sur la route la plus proche
 * (OSRM), pour qu'il ne tombe jamais dans la mer ou au milieu d'un pâté de maisons.
 *
 * Règles de Nominatim : un nom d'application identifiable, une recherche à la
 * fois, résultats gardés en cache (30 jours ici).
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
/** Base Adresse Nationale, service de géocodage de l'IGN (Géoplateforme). */
const BAN = "https://data.geopf.fr/geocodage/search";
/** En dessous, la BAN a deviné : on ne la croit pas. */
const BAN_MIN_SCORE = 0.5;
/** Au-delà, un résultat est hors de la commune demandée. */
const FAR_FROM_COMMUNE_KM = 8;
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

const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Ce qu'on a trouvé : le numéro exact, seulement la rue (son milieu), un lieu proche, ou rien (centre de la commune). */
export type GeocodePrecision = "number" | "street" | "place" | "commune";

/** Base Adresse Nationale : l'adresse dans sa commune (numéro, sinon la rue), ou null. */
async function searchBan(line: string, commune: string): Promise<{ point: Point; precision: "number" | "street" } | null> {
  const url = `${BAN}?limit=5&q=${encodeURIComponent(`${line} ${commune}`.slice(0, 200))}`;
  try {
    const res = await fetch(url, { next: { revalidate: MONTH }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      features?: { geometry: { coordinates: [number, number] }; properties: { score: number; type: string; city?: string; citycode?: string } }[];
    };
    const hit = (body.features ?? []).find(
      (f) =>
        // Code de commune de Mayotte (976xx) : la BAN y met « 97 » comme département.
        (f.properties.citycode ?? "").startsWith("976") &&
        f.properties.score >= BAN_MIN_SCORE &&
        (f.properties.type === "housenumber" || f.properties.type === "street") &&
        plain(f.properties.city ?? "") === plain(commune),
    );
    if (!hit) return null;
    const [lng, lat] = hit.geometry.coordinates;
    if (!isInMayotte(lat, lng)) return null;
    return { point: { lat, lng }, precision: hit.properties.type === "housenumber" ? "number" : "street" };
  } catch {
    return null;
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

/**
 * Point d'une adresse écrite, posé sur une route. `precision` dit ce qu'on a vraiment trouvé :
 * à dire à la personne quand ce n'est pas le numéro exact, plutôt que de faire semblant.
 */
export async function geocodeAddress(line: string, commune: string): Promise<{ point: Point; found: boolean; precision: GeocodePrecision }> {
  const official = await searchBan(line, commune);
  if (official) return { point: await snapToRoad(official.point), found: true, precision: official.precision };
  for (const q of queries(line, commune)) {
    const hit = await search(q);
    // Loin de la commune : erreur de la carte (même nom de rue ailleurs), écarté.
    // Distance au centre plutôt que « commune la plus proche » : Trévani (Koungou) est plus près du centre de Mamoudzou.
    if (hit && (!COMMUNE_CENTERS[commune] || distanceKm(hit, COMMUNE_CENTERS[commune]) <= FAR_FROM_COMMUNE_KM)) return { point: await snapToRoad(hit), found: true, precision: "place" };
  }
  return { point: await snapToRoad(COMMUNE_CENTERS[commune] ?? COMMUNE_CENTERS.Mamoudzou), found: false, precision: "commune" };
}

/** N'importe quel lieu de Mayotte (« hôpital de Mamoudzou », « plage de N'Gouja »), posé sur une route ; null s'il est introuvable. */
export async function geocodeQuery(q: string): Promise<Point | null> {
  const hit = await search(q);
  return hit ? snapToRoad(hit) : null;
}

/** Restaurant : cherché par son nom dans sa commune, sinon à sa place par défaut (`fallback`) ; posé sur une route. */
export async function geocodePlace(name: string, commune: string, fallback: Point): Promise<Point> {
  // Seulement un commerce : un nom courant (« Le Snack ») ne doit pas tomber sur une rue ou un village.
  const hit = await search(`${name}, ${commune}`, ["amenity", "shop", "tourism"]);
  return snapToRoad(hit ?? fallback);
}

import { COMMUNE_CENTERS, distanceKm, PETITE_TERRE, type Point } from "@/lib/geo/communes";
import { VILLAGES } from "@/lib/geo/villages";

/**
 * Où se trouve chaque restaurant, pour « les tacos les plus proches de chez moi ».
 *
 * Le catalogue ne donne que la commune (presque tous « Mamoudzou ») : tous les
 * restaurants semblaient à la même distance et le tri ne servait à rien. Ici, la
 * position de chaque restaurant, relevée sur Google Maps le 2026-11-12 à la demande
 * de l'utilisateur. Gardé hors de jeje-catalog.ts, qui est regénéré.
 *
 * Pas encore placés (fiche absente ou douteuse sur Google Maps) : Tasty Snack,
 * Le Finidy, Lunch Box Gourmet, Traiteur Good Eat, Le Goût des îles. Sans position, le
 * restaurant est placé au centre de sa commune, sans distance affichée.
 */
export const RESTAURANT_SPOTS: Record<string, { lat: number; lng: number; address: string }> = {
  "brochette-mangrove": { lat: -12.7837, lng: 45.23205, address: "RN 2, Mamoudzou" },
  "delices-dashi": { lat: -12.77219, lng: 45.22208, address: "Rue des Fleurs, Kawéni" },
  "jeje-kebab-mamoudzou": { lat: -12.78158, lng: 45.23003, address: "38 rue du Cinéma, Mamoudzou" },
  "jeje-pizza-mamoudzou": { lat: -12.78157, lng: 45.23014, address: "38 rue du Cinéma, Mamoudzou" },
  "le-quartier-gourmand": { lat: -12.78299, lng: 45.22919, address: "107 rue du Commerce, Mamoudzou" },
  "resto-renad": { lat: -12.7783, lng: 45.22853, address: "97 rue Toumbou Selemani, Mamoudzou" },
  "caresse-cream": { lat: -12.78142, lng: 45.23246, address: "Rue du Commerce, Mamoudzou" },
  "crousty-palm": { lat: -12.78483, lng: 45.22905, address: "374 boulevard Mawana Madi, Mamoudzou" },
  "kebab-house": { lat: -12.7741, lng: 45.22262, address: "Espace Corallium, RN, Kawéni" },
  "lorient-express": { lat: -12.77598, lng: 45.22555, address: "Zone industrielle de Kawéni, RN1" },
  "le-voule": { lat: -12.78321, lng: 45.22185, address: "496 boulevard Marcel Henri, Cavani Stade" },
  "o-chill-grill": { lat: -12.77075, lng: 45.22566, address: "Route de la Grande Traversée, Kawéni" },
  "taxi-brousse-wass-na-wass": { lat: -12.81266, lng: 45.20281, address: "1395 RN 2, Mamoudzou" },
  "le-quartz": { lat: -12.75688, lng: 45.22903, address: "Les Hauts Vallons, Mamoudzou" },
  "m-biwi-pizza": { lat: -12.75686, lng: 45.22905, address: "Les Hauts Vallons, Mamoudzou" },
  "mfaoume-snack": { lat: -12.78217, lng: 45.23246, address: "16 avenue Chehou Soilihi, Mamoudzou" },
  // Donnés par l'utilisateur le 2026-11-12, placés d'après Google Maps.
  "freddys-may-food": { lat: -12.80171, lng: 45.214, address: "113 avenue Arantabé, Passamainty" },
  // « En face de la mosquée de la route » : la mosquée de Majicavo-Lamir.
  "top-cuisine-976": { lat: -12.75271, lng: 45.23084, address: "En face de la mosquée, Majicavo-Lamir" },
  // 76 rue du Collège Ouvoimoja : placé au collège de Passamainty, à quelques dizaines de mètres près.
  kazdal: { lat: -12.79906, lng: 45.20581, address: "76 rue du Collège Ouvoimoja, Passamainty" },
};

type Located = { commune: string; id: string };

/** Quartier le plus proche d'un point (« Kawéni », « Cavani »…), pour le dire à la personne. */
function quartierOf(point: Point): string {
  let best = VILLAGES[0];
  for (const v of VILLAGES) if (distanceKm(point, v.point) < distanceKm(point, best.point)) best = v;
  return best.name;
}

/** Position du restaurant ; exact = relevée sur la carte (sinon, le centre de sa commune). */
export function restaurantPlace(r: Located): { point: Point; exact: boolean; label: string } | null {
  const spot = RESTAURANT_SPOTS[r.id];
  if (spot) {
    const point = { lat: spot.lat, lng: spot.lng };
    return { point, exact: true, label: quartierOf(point) };
  }
  const center = COMMUNE_CENTERS[r.commune];
  return center ? { point: center, exact: false, label: r.commune } : null;
}

/** km de la personne au restaurant (barge comptée 15 km), null sans position. */
export function kmToRestaurant(from: Point | null, fromCommune: string | null, r: Located): number | null {
  const place = restaurantPlace(r);
  if (!from || !place) return null;
  const barge = fromCommune && PETITE_TERRE.has(r.commune) !== PETITE_TERRE.has(fromCommune) ? 15 : 0;
  return distanceKm(from, place.point) + barge;
}

/** Combien de restaurants montrer pour « les plus proches ». */
export const NEAREST_COUNT = 5;

import { COMMUNE_CENTERS, distanceKm, PETITE_TERRE, type Point } from "@/lib/geo/communes";
import { findVillage } from "@/lib/geo/villages";

/**
 * Où se trouve chaque restaurant, pour « les tacos les plus proches de chez moi ».
 *
 * Le catalogue ne donne que la commune (presque tous « Mamoudzou ») : tous les
 * restaurants semblaient à la même distance et le tri ne servait à rien. Ici, le
 * quartier de chaque restaurant (un nom de src/lib/geo/villages.ts : « Kawéni »,
 * « Cavani », « M'Tsapéré »…). Gardé hors de jeje-catalog.ts, qui est regénéré.
 *
 * À compléter : aucune adresse fiable trouvée en ligne le 2026-11-12. Sans
 * quartier, le restaurant est placé au centre de sa commune, sans distance affichée.
 */
export const RESTAURANT_QUARTIERS: Record<string, string> = {
  // "tasty-snack": "Kawéni",
};

type Located = { commune: string; id: string };

/** Position du restaurant ; exact = son quartier est connu (sinon, le centre de sa commune). */
export function restaurantPlace(r: Located): { point: Point; exact: boolean; label: string } | null {
  const village = RESTAURANT_QUARTIERS[r.id] ? findVillage(RESTAURANT_QUARTIERS[r.id]) : null;
  if (village) return { point: village.point, exact: true, label: village.name };
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

import type { Point } from "./communes";
import { placeKey } from "./villages";

/**
 * Plages et lieux connus de Mayotte, avec les noms qu'on dit vraiment (« Grande Moya »).
 * Positions : OpenStreetMap (© contributeurs OpenStreetMap, licence ODbL ; relevé du 2026-11-12).
 * Gardés dans le site, comme les villages : la carte en ligne ne répond pas toujours au serveur.
 * Demande de l'utilisateur : « de chez moi jusqu'à Moya » ne trouvait pas Moya.
 */
const PLACES: { name: string; lat: number; lng: number; other?: string[] }[] = [
  // Petite-Terre. La Petite Moya est côté La Vigie (nord), la Grande Moya côté Pamandzi.
  { name: "Petite Moya", lat: -12.7818, lng: 45.2957, other: ["Petit Moya", "Moya 1"] },
  { name: "Grande Moya", lat: -12.7847, lng: 45.296, other: ["Grand Moya", "Moya 2"] },
  { name: "Plage de N'Gouja", lat: -12.9626, lng: 45.0858, other: ["N'Gouja", "Ngouja"] },
  { name: "Plage de Sakouli", lat: -12.8884, lng: 45.2133, other: ["Sakouli"] },
  { name: "Plage de Saziley", lat: -12.9854, lng: 45.1805, other: ["Saziley"] },
  { name: "Tahiti plage", lat: -12.8663, lng: 45.1133, other: ["M'Tsanga Gnougni"] },
];

/** Un nom pour plusieurs lieux : Tamilya demande lequel au lieu de choisir à la place de la personne. */
const SAME_NAME: [said: string, choices: string[]][] = [["Moya", ["Grande Moya", "Petite Moya"]]];

/** « plage de la Grande Moya » → « grandemoya » : « plage » et « de » ne changent pas le lieu. */
const keyOf = (text: string) =>
  placeKey(
    text
      .replace(/^\s*(?:la |le |les |l')?(?:plages?|mtsanga|m'tsanga)\s+(?:de |du |des |d'|à |a )?/i, "")
      .replace(/^\s*(?:la |le |l')/i, ""),
  );

const BY_KEY = new Map<string, { name: string; point: Point }>();
for (const place of PLACES) {
  const found = { name: place.name, point: { lat: place.lat, lng: place.lng } };
  for (const name of [place.name, ...(place.other ?? [])]) BY_KEY.set(keyOf(name), found);
}
const CHOICES = new Map(SAME_NAME.map(([said, choices]) => [keyOf(said), choices]));

/** Le lieu connu nommé (« petite moya », « plage de Sakouli »), ou null. */
export function findLandmark(text: string): { name: string; point: Point } | null {
  return BY_KEY.get(keyOf(text)) ?? null;
}

/** Les lieux possibles quand le nom en désigne plusieurs (« moya » → Grande Moya, Petite Moya), sinon null. */
export function landmarkChoices(text: string): string[] | null {
  return CHOICES.get(keyOf(text)) ?? null;
}

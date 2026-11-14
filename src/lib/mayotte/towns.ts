import { COMMUNE_CENTERS, distanceKm, nearestCommune, PETITE_TERRE, type Point } from "@/lib/geo/communes";
import { findVillage, placeKey } from "@/lib/geo/villages";
import { MAYOTTE_PLACES } from "@/lib/voice-live/mayotte-places";
import { matchPlace } from "@/lib/voice-live/place-snap";

/**
 * Villes et villages de Mayotte pour la carte de la page « Mayotte » : Tamilya
 * en nomme un à la voix, la carte vole jusque-là et elle dit ce qui est sûr
 * (sa commune, où il se trouve sur l'île). Utilisable côté navigateur.
 */

export type Town = {
  name: string;
  point: Point;
  /** Sa commune (elle-même si c'en est une). */
  commune: string;
  isCommune: boolean;
  /** Où il se trouve, en mots (« au nord de Grande-Terre, côté ouest, à environ 20 km de Mamoudzou à vol d'oiseau »). */
  where: string;
};

const COMMUNES = new Map(Object.keys(COMMUNE_CENTERS).map((name) => [placeKey(name), name]));
/** Commune de chaque village connu (les autres : la commune au centre le plus proche). */
const COMMUNE_OF = new Map<string, string>();
for (const [commune, places] of Object.entries(MAYOTTE_PLACES)) {
  const name = COMMUNES.get(placeKey(commune)) ?? commune;
  for (const place of places) COMMUNE_OF.set(placeKey(place), name);
}

function whereIs(point: Point, commune: string): string {
  if (PETITE_TERRE.has(commune)) return "sur Petite-Terre, l'île de l'aéroport, en face de Mamoudzou";
  const part = point.lat > -12.76 ? "au nord" : point.lat < -12.88 ? "au sud" : "au centre";
  const side = point.lng < 45.12 ? ", côté ouest" : point.lng > 45.17 ? ", côté est" : "";
  const km = Math.round(distanceKm(point, COMMUNE_CENTERS.Mamoudzou));
  return `${part} de Grande-Terre${side}${km >= 2 ? `, à environ ${km} km de Mamoudzou à vol d'oiseau` : ""}`;
}

/** La ville ou le village nommé, même mal entendu (« mtsapere », « Combanie »), ou null. */
export function findTown(said: string): Town | null {
  const heard = said.trim();
  if (!heard) return null;
  const guess = matchPlace(heard);
  const place = findVillage(heard) ?? (guess ? findVillage(guess) : null);
  const communeName = COMMUNES.get(placeKey(place?.name ?? guess ?? heard));
  if (!place && !communeName) return null;
  const name = place?.name ?? communeName!;
  const point = place?.point ?? COMMUNE_CENTERS[communeName!];
  const commune = communeName ?? COMMUNE_OF.get(placeKey(name)) ?? nearestCommune(point);
  return { name, point, commune, isCommune: Boolean(communeName), where: whereIs(point, commune) };
}

/** Route entre deux lieux : distance, temps en voiture et tracé ([longitude, latitude]). */
export type TownRoute = { km: number; minutes: number; line: [number, number][] };

const minutesText = (minutes: number) => (minutes < 60 ? `${minutes} minutes` : `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`);

/** Ce que Tamilya reçoit après avoir tracé un trajet : seulement des faits sûrs (`route` null : route pas calculée). */
export function describeRoute(from: Town, to: Town, route: Pick<TownRoute, "km" | "minutes"> | null): string {
  const barge = PETITE_TERRE.has(from.commune) !== PETITE_TERRE.has(to.commune) ? " Il faut prendre la barge entre Grande-Terre et Petite-Terre." : "";
  if (!route)
    return `La carte montre ${from.name} et ${to.name} avec deux repères, mais la route entre les deux n'a pas pu être calculée pour l'instant : dis-le simplement, sans donner de distance ni de temps.${barge}`;
  return `La carte trace en rose la route de ${from.name} à ${to.name} et se cadre sur tout le trajet. Faits sûrs : environ ${String(route.km).replace(".", ",")} km par la route, environ ${minutesText(route.minutes)} en voiture, sans compter les bouchons.${barge} Dis-le avec tes mots, en une ou deux phrases ; aucun autre chiffre.`;
}

/** Ce que Tamilya reçoit après avoir montré un lieu : seulement des faits sûrs (`population` : habitants de la commune, si connus). */
export function describeTown(town: Town, population: string | null): string {
  const kind = town.isCommune ? `${town.name} est une commune de Mayotte` : `${town.name} est un village de la commune de ${town.commune}`;
  const people = population ? ` La commune de ${town.commune} compte ${population} habitants (population légale INSEE).` : "";
  return `La carte vole jusqu'à ${town.name} et zoome dessus, avec un repère lumineux. Faits sûrs : ${kind}, ${town.where}.${people} Dis-le avec tes mots, en deux ou trois phrases, et ajoute ce que ce lieu a de connu seulement si tu en es sûre ; aucun chiffre inventé.`;
}

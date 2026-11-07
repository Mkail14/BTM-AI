import "server-only";
import type { Address } from "@/lib/address";
import { COMMUNE_CENTERS, PETITE_TERRE, distanceKm, nearestCommune, type Point } from "@/lib/geo/communes";
import { geocodeAddress, geocodeQuery, snapToRoad } from "@/lib/geo/geocode";
import { getMayotteServices, matchServices, servicesAsked } from "@/lib/live/services";
import { formatMinutes } from "./intent";

/**
 * Trajet entre deux lieux de Mayotte : le lieu d'arrivée (un service public
 * de l'annuaire, une commune ou n'importe quel lieu trouvé sur la carte), le
 * départ (lieu dit, position GPS ou adresse du compte), puis le temps en
 * voiture (OSRM) et à pied (OSRM à pied, FOSSGIS). Gratuit et sans clé.
 */

const CAR = "https://router.project-osrm.org/route/v1/driving";
const FOOT = "https://routing.openstreetmap.de/routed-foot/route/v1/driving";

export type TripPlace = {
  label: string;
  /** Adresse écrite, si on la connaît. */
  detail: string | null;
  point: Point;
};

export type TripPlan = {
  from: TripPlace & { kind: "home" | "gps" | "place" };
  to: TripPlace & { phones: string[]; hours: string | null; link: string | null };
  car: { minutes: number; km: number; path: [number, number][] } | null;
  walk: { minutes: number; km: number } | null;
  /** Le trajet passe la mer (Grande-Terre ↔ Petite-Terre) : barge en plus. */
  barge: boolean;
};

export type TripFailure = "no_destination" | "no_origin" | "no_route";

const plain = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Un lieu nommé : service public, commune, puis recherche sur la carte.
 * `near` : parmi plusieurs services du même type (CSSM, gendarmerie…), le plus proche de ce point.
 */
export async function resolvePlace(text: string, near?: Point): Promise<(TripPlace & { phones: string[]; hours: string | null; link: string | null }) | null> {
  const query = text.trim();
  if (!query) return null;
  if (servicesAsked(query)) {
    const located = matchServices(await getMayotteServices(), query, 50).found.filter((s) => s.point);
    if (near) located.sort((a, b) => distanceKm(near, a.point!) - distanceKm(near, b.point!));
    const service = located[0];
    if (service?.point) {
      return { label: service.name, detail: service.address, point: await snapToRoad(service.point), phones: service.phones, hours: service.hours, link: service.link };
    }
  }
  const commune = Object.keys(COMMUNE_CENTERS).find((name) => plain(name) === plain(query));
  if (commune) return { label: commune, detail: null, point: await snapToRoad(COMMUNE_CENTERS[commune]), phones: [], hours: null, link: null };
  const point = await geocodeQuery(query);
  return point ? { label: capitalize(query), detail: nearestCommune(point), point, phones: [], hours: null, link: null } : null;
}

async function osrm(base: string, from: Point, to: Point, full: boolean) {
  const coords = `${from.lng.toFixed(5)},${from.lat.toFixed(5)};${to.lng.toFixed(5)},${to.lat.toFixed(5)}`;
  const url = `${base}/${coords}?alternatives=false&${full ? "overview=full&geometries=geojson" : "overview=false"}`;
  const res = await fetch(url, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = (await res.json()) as { routes?: { distance: number; duration: number; geometry?: { coordinates: [number, number][] } }[] };
  const r = data.routes?.[0];
  if (!r) return null;
  return {
    minutes: Math.max(1, Math.round(r.duration / 60)),
    km: Math.round(r.distance / 100) / 10,
    path: (r.geometry?.coordinates ?? []).map(([lng, lat]) => [lat, lng] as [number, number]),
  };
}

/**
 * @param to    lieu d'arrivée, dans les mots de la personne
 * @param from  lieu de départ dit par la personne (null : position GPS, sinon adresse du compte)
 * @param gps   position du téléphone, si la personne l'a donnée
 * @param home  adresse enregistrée dans ses paramètres
 */
export async function planTrip(
  { to, from, gps }: { to: string; from: string | null; gps: Point | null },
  home: Address | null,
): Promise<TripPlan | TripFailure> {
  // Départ d'abord : l'arrivée (« la CSSM ») est choisie la plus proche de lui.
  const departure = await (async (): Promise<TripPlan["from"] | null> => {
    if (gps) return { label: "Ma position", detail: nearestCommune(gps), point: await snapToRoad(gps), kind: "gps" };
    if (from) {
      const place = await resolvePlace(from);
      return place ? { label: place.label, detail: place.detail, point: place.point, kind: "place" } : null;
    }
    if (!home) return null;
    const point = home.geo ? await snapToRoad(home.geo) : (await geocodeAddress(home.line, home.commune)).point;
    return { label: "Chez moi", detail: `${home.line}, ${home.commune}`, point, kind: "home" };
  })();
  const arrival = await resolvePlace(to, departure?.point);
  if (!arrival) return "no_destination";
  if (!departure) return "no_origin";

  const [car, walk] = await Promise.all([
    osrm(CAR, departure.point, arrival.point, true).catch(() => null),
    osrm(FOOT, departure.point, arrival.point, false).catch(() => null),
  ]);
  if (!car && !walk) return "no_route";
  const side = (p: Point) => PETITE_TERRE.has(nearestCommune(p));
  return {
    from: departure,
    to: arrival,
    car,
    walk: walk ? { minutes: walk.minutes, km: walk.km } : null,
    barge: side(departure.point) !== side(arrival.point),
  };
}

/** Le trajet en une phrase, pour Tamilya (vocal) : ce qu'elle dit à voix haute. */
export function describeTrip(plan: TripPlan): string {
  const parts = [
    `Trajet de ${plan.from.label}${plan.from.detail ? ` (${plan.from.detail})` : ""} jusqu'à ${plan.to.label}${plan.to.detail ? ` (${plan.to.detail})` : ""}.`,
    plan.car ? `En voiture ou en taxi : environ ${formatMinutes(plan.car.minutes)} pour ${plan.car.km} km, sans compter les bouchons.` : null,
    plan.walk ? `À pied : environ ${formatMinutes(plan.walk.minutes)}.` : null,
    plan.barge ? "Il faut aussi prendre la barge entre Grande-Terre et Petite-Terre." : null,
    plan.to.hours ? `Horaires : ${plan.to.hours}.` : null,
    "La carte est à l'écran, avec les boutons Google Maps et Waze. Les prix des taxis et les bus arrivent bientôt.",
  ];
  return parts.filter(Boolean).join(" ");
}

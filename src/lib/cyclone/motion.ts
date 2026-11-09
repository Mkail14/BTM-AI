import { MAYOTTE, type Cyclone, type CyclonePoint } from "./intent";

/**
 * Le cyclone a-t-il bougé ? Calculé sur le trajet mesuré (pas la prévision),
 * pour le dire en une phrase : « depuis hier 15 h, 375 km vers l'ouest, 375 km
 * plus près de Mayotte ». Utilisé par la carte et par Tamilya. Sans serveur.
 */

/** Distance en km (à vol d'oiseau). */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

const DIRECTIONS = ["le nord", "le nord-est", "l'est", "le sud-est", "le sud", "le sud-ouest", "l'ouest", "le nord-ouest"];

/** « vers l'ouest », d'un point à l'autre. */
export function directionOf(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const y = Math.sin((to.lng - from.lng) * rad) * Math.cos(to.lat * rad);
  const x = Math.cos(from.lat * rad) * Math.sin(to.lat * rad) - Math.sin(from.lat * rad) * Math.cos(to.lat * rad) * Math.cos((to.lng - from.lng) * rad);
  const bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return DIRECTIONS[Math.round(bearing / 45) % 8];
}

export type Motion = {
  /** Heure ISO du point de départ de la comparaison (environ 24 h avant la dernière mesure). */
  since: string;
  hours: number;
  /** Chemin parcouru, en km. */
  movedKm: number;
  /** « l'ouest », « le sud-ouest »… */
  direction: string;
  speedKmh: number;
  /** Positif : plus près de Mayotte ; négatif : plus loin. */
  closerKm: number;
};

/** Déplacement mesuré sur les dernières 24 h environ (au moins 6 h). null : une seule mesure. */
export function motionOf(c: Pick<Cyclone, "track" | "now">): Motion | null {
  const done = c.track.filter((t) => !t.forecast);
  if (done.length < 2) return null;
  const last = done[done.length - 1];
  const lastT = Date.parse(last.at);
  // Le point le plus proche de « 24 h avant », mais au moins 6 h avant.
  const before = done.filter((t) => lastT - Date.parse(t.at) >= 6 * 3_600_000);
  if (!before.length) return null;
  const ref = before.reduce((best, t) => (Math.abs(lastT - Date.parse(t.at) - 86_400_000) < Math.abs(lastT - Date.parse(best.at) - 86_400_000) ? t : best));
  const hours = (lastT - Date.parse(ref.at)) / 3_600_000;
  // Chemin suivi (somme des étapes), pas seulement la ligne droite.
  const path = done.slice(done.indexOf(ref));
  let movedKm = 0;
  for (let i = 1; i < path.length; i++) movedKm += km(path[i - 1], path[i]);
  return {
    since: ref.at,
    hours: Math.round(hours),
    movedKm: Math.round(movedKm),
    direction: directionOf(ref, last),
    speedKmh: Math.round(movedKm / hours),
    closerKm: Math.round(km(MAYOTTE, ref) - km(MAYOTTE, last)),
  };
}

/** Heures écoulées depuis la dernière mesure. */
export const ageHours = (c: Pick<Cyclone, "now">, now = Date.now()) => Math.max(0, (now - Date.parse(c.now.at)) / 3_600_000);

/** Au-delà, on prévient que la donnée n'est plus fraîche (Météo-France publie toutes les 6 h). */
export const STALE_AFTER_H = 12;

/** Position à une heure donnée, entre deux points du trajet (pour rejouer le trajet). */
export function positionAt(track: readonly CyclonePoint[], t: number): CyclonePoint | null {
  if (!track.length) return null;
  const times = track.map((p) => Date.parse(p.at));
  if (t <= times[0]) return track[0];
  for (let i = 1; i < track.length; i++) {
    if (t <= times[i]) {
      const k = (t - times[i - 1]) / (times[i] - times[i - 1] || 1);
      const a = track[i - 1];
      const b = track[i];
      return { lat: a.lat + (b.lat - a.lat) * k, lng: a.lng + (b.lng - a.lng) * k, at: new Date(t).toISOString(), forecast: b.forecast };
    }
  }
  return track[track.length - 1];
}

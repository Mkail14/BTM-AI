import { geolocationErrorMessage, isInMayotte, MAX_GPS_ACCURACY_M, type GeoPoint } from "@/lib/address";

/**
 * Centre de chaque commune de Mayotte (positions approximatives, mairie ou
 * centre du bourg) : pour classer ce qui est « près de chez moi » et
 * retrouver la commune d'une position GPS. Utilisable côté navigateur.
 */

export type Point = { lat: number; lng: number };

export const COMMUNE_CENTERS: Record<string, Point> = {
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

/** Petite-Terre : séparée de Grande-Terre par la barge. */
export const PETITE_TERRE = new Set(["Dzaoudzi", "Pamandzi"]);

/** Distance à vol d'oiseau, en km. */
export function distanceKm(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const x = (b.lng - a.lng) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6371;
}

/** Commune dont le centre est le plus proche d'une position. */
export function nearestCommune(point: Point): string {
  let best = "Mamoudzou";
  let min = Infinity;
  for (const [commune, center] of Object.entries(COMMUNE_CENTERS)) {
    const d = distanceKm(point, center);
    if (d < min) [best, min] = [commune, d];
  }
  return best;
}

/** Position actuelle (navigateur), vérifiée : à Mayotte et assez précise pour un livreur. */
export function locateMe(): Promise<{ ok: true; geo: GeoPoint; commune: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve({ ok: false, error: "Ton navigateur ne sait pas donner ta position." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (!isInMayotte(coords.latitude, coords.longitude)) resolve({ ok: false, error: "Ta position n'est pas à Mayotte." });
        else if (coords.accuracy > MAX_GPS_ACCURACY_M) resolve({ ok: false, error: "Position trop imprécise : sors un peu ou active le GPS." });
        else {
          const geo = { lat: coords.latitude, lng: coords.longitude, accuracy: Math.round(coords.accuracy) };
          resolve({ ok: true, geo, commune: nearestCommune(geo) });
        }
      },
      (error) => resolve({ ok: false, error: geolocationErrorMessage(error.code) }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

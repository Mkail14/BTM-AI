import { NextResponse, type NextRequest } from "next/server";
import { isInMayotte } from "@/lib/address";
import { getAuthContext } from "@/lib/auth/session";

/**
 * Itinéraire sur les vraies routes de Mayotte, pour la carte du suivi de
 * commande : OSRM (moteur de calcul d'itinéraire libre, données
 * OpenStreetMap, sans clé). Passer par le serveur garde chaque trajet en
 * cache une journée et évite d'envoyer la position de la personne à OSRM
 * depuis son navigateur.
 *
 * GET /api/route?from=lat,lng&to=lat,lng[&alt=0] → { routes: [{ path: [[lat, lng]…], km, minutes }] }
 * Le premier trajet est le plus rapide ; les suivants sont des chemins de rechange.
 */

const OSRM = "https://router.project-osrm.org/route/v1/driving";

export type RouteResponse = { routes: { path: [number, number][]; km: number; minutes: number }[] };

function point(value: string | null) {
  const [lat, lng] = (value ?? "").split(",").map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) && isInMayotte(lat, lng) ? { lat, lng } : null;
}

// Cinq décimales (≈ 1 m) : assez précis, et les positions proches partagent le même cache.
const fixed = (n: number) => n.toFixed(5);

/** Trajets OSRM passant par `points` (départ, étapes, arrivée), en [lat, lng]. Gardés en cache une journée. */
async function osrm(points: { lat: number; lng: number }[], alternatives: boolean): Promise<RouteResponse["routes"]> {
  const coords = points.map((p) => `${fixed(p.lng)},${fixed(p.lat)}`).join(";");
  const url = `${OSRM}/${coords}?overview=full&geometries=geojson&alternatives=${alternatives}`;
  const res = await fetch(url, { next: { revalidate: 86_400 }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = (await res.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
  return (data.routes ?? []).slice(0, 2).map((r) => ({
    path: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
    km: Math.round(r.distance) / 1000,
    minutes: Math.round(r.duration / 60),
  }));
}

export async function GET(request: NextRequest) {
  const { user } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Connecte-toi." }, { status: 401 });
  const from = point(request.nextUrl.searchParams.get("from"));
  const to = point(request.nextUrl.searchParams.get("to"));
  if (!from || !to) return NextResponse.json({ error: "Points hors de Mayotte." }, { status: 400 });

  try {
    const routes = await osrm([from, to], true);
    if (!routes.length) throw new Error("OSRM : aucun trajet");
    // Pas de chemin de rechange (fréquent à Mayotte, peu de routes) : un détour par une rue voisine,
    // passant à 350 m du milieu du trajet, s'il ne rallonge pas trop.
    if (request.nextUrl.searchParams.get("alt") !== "0" && routes.length === 1 && routes[0].path.length > 4) {
      const path = routes[0].path;
      const i = Math.floor(path.length / 2);
      const [aLat, aLng] = path[Math.max(0, i - 3)];
      const [bLat, bLng] = path[Math.min(path.length - 1, i + 3)];
      const len = Math.hypot(bLat - aLat, bLng - aLng) || 1;
      const via = { lat: path[i][0] + ((bLng - aLng) / len) * 0.0032, lng: path[i][1] - ((bLat - aLat) / len) * 0.0032 };
      const detour = isInMayotte(via.lat, via.lng) ? (await osrm([from, via, to], false).catch(() => []))[0] : undefined;
      if (detour && detour.km < routes[0].km * 1.6) routes.push(detour);
    }
    const body: RouteResponse = { routes };
    return NextResponse.json(body, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    console.warn("[route] Itinéraire indisponible", error);
    return NextResponse.json({ error: "Itinéraire indisponible." }, { status: 503 });
  }
}

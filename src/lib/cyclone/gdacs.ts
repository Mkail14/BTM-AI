import "server-only";
import { MAYOTTE, type Cyclone, type CyclonePoint } from "./intent";

/**
 * Cyclones en cours dans le sud-ouest de l'océan Indien, lus sur GDACS
 * (service gratuit de l'ONU et de l'Union européenne, sans clé). Pour notre
 * bassin, GDACS reprend les données de Météo-France La Réunion (« RSMC ») :
 * les systèmes numérotés mais pas encore nommés (en formation) y sont aussi.
 * Gardés 15 minutes.
 */

const EVENTS = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP";
const CACHE_MS = 15 * 60_000;
const TIMEOUT_MS = 6_000;

let cache: { at: number; cyclones: Cyclone[] } | null = null;

type Feature = {
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
};
type Collection = { features?: Feature[] };

const get = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`GDACS ${res.status}`);
  return (await res.json()) as Collection;
};

/** Sud-ouest de l'océan Indien : de l'Afrique à l'ouest de l'Australie, sous l'équateur. */
const inBasin = ([lng, lat]: number[]) => lng >= 25 && lng <= 100 && lat <= 2 && lat >= -45;

/** Distance en km (à vol d'oiseau). */
export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return Math.round(12_742 * Math.asin(Math.sqrt(h)));
}

/** « AGUEDA-27 » → « Agueda » ; « 02-20262027-27 » → « Système n°2 » (pas encore nommé). */
function nameOf(raw: string): { name: string; forming: boolean } {
  const numbered = /^0*(\d+)-\d{8}/.exec(raw);
  if (numbered) return { name: `Système n°${numbered[1]}`, forming: true };
  const base = raw.replace(/-\d+$/, "").toLowerCase();
  return { name: base.charAt(0).toUpperCase() + base.slice(1), forming: false };
}

/** Stade du système, en français, d'après le texte de GDACS. */
function statusOf(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("hurricane") || t.includes("typhoon") || t.includes("cyclone")) return "Cyclone tropical";
  if (t.includes("storm")) return "Tempête tropicale";
  if (t.includes("depression")) return "Dépression tropicale";
  return "Perturbation tropicale";
}

/** Heure d'un point du trajet (« 11070600 » = 7 novembre, 06:00 UTC), l'année tirée de l'analyse. */
function timeOf(key: string, analysis: Date): Date | null {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(key);
  if (!m) return null;
  let year = analysis.getUTCFullYear();
  // Analyse fin décembre, point en janvier : année suivante (et l'inverse).
  if (analysis.getUTCMonth() === 11 && m[1] === "01") year += 1;
  if (analysis.getUTCMonth() === 0 && m[1] === "12") year -= 1;
  return new Date(Date.UTC(year, Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4])));
}

/** Centre d'un petit cercle (GDACS dessine chaque point du trajet comme un rond). */
function centerOf(ring: number[][]): { lat: number; lng: number } {
  const pts = ring.slice(0, -1).length ? ring.slice(0, -1) : ring;
  const lng = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

async function readCyclone(event: Feature): Promise<Cyclone | null> {
  const p = event.properties;
  const coords = event.geometry.coordinates as number[];
  const url = (p.url ?? {}) as { geometry?: string; report?: string };
  const severity = (p.severitydata ?? {}) as { severity?: number; severitytext?: string };
  const { name, forming } = nameOf(String(p.eventname ?? ""));
  const now = { lat: coords[1], lng: coords[0], at: new Date(`${String(p.todate)}Z`).toISOString() };

  let track: CyclonePoint[] = [];
  let cone: [number, number][][] | null = null;
  if (url.geometry?.startsWith("https://www.gdacs.org/")) {
    const geo = await get(url.geometry).catch(() => null);
    const analysis = new Date(`${String(p.todate)}Z`);
    for (const f of geo?.features ?? []) {
      const cls = String(f.properties.Class ?? "");
      if (cls.startsWith("Point_Polygon_Point") && f.geometry.type === "Polygon") {
        const at = timeOf(String(f.properties.key ?? ""), analysis);
        const ring = (f.geometry.coordinates as number[][][])[0];
        if (!at || !ring?.length) continue;
        track.push({ ...centerOf(ring), at: at.toISOString(), forecast: at.getTime() > analysis.getTime() });
      } else if (cls === "Poly_Cones" && f.geometry.type === "Polygon") {
        cone = (f.geometry.coordinates as number[][][]).map((ring) => ring.map(([lng, lat]) => [lng, lat] as [number, number]));
      }
    }
    track = track.sort((a, b) => a.at.localeCompare(b.at));
  }
  if (!track.length) track = [{ ...now, forecast: false }];

  const ahead = track.filter((t) => t.forecast);
  const nearest = ahead.reduce<{ km: number; at: string } | null>((best, t) => {
    const km = kmBetween(MAYOTTE, t);
    return !best || km < best.km ? { km, at: t.at } : best;
  }, null);

  return {
    id: String(p.eventid),
    name,
    forming,
    status: statusOf(String(severity.severitytext ?? "")),
    windKmh: typeof severity.severity === "number" ? Math.round(severity.severity) : null,
    now,
    track,
    cone,
    distanceKm: kmBetween(MAYOTTE, now),
    closest: nearest,
    link: url.report?.startsWith("https://www.gdacs.org/") ? url.report : "https://www.gdacs.org/",
  };
}

/** Cyclones en cours autour de Mayotte (sud-ouest de l'océan Indien), du plus proche au plus loin. */
export async function getCyclones(): Promise<Cyclone[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.cyclones;
  try {
    const list = await get(EVENTS);
    const events = (list.features ?? []).filter(
      (f) =>
        f.properties.eventtype === "TC" &&
        String(f.properties.iscurrent) === "true" &&
        f.geometry.type === "Point" &&
        inBasin(f.geometry.coordinates as number[]),
    );
    const cyclones = (await Promise.all(events.slice(0, 6).map((e) => readCyclone(e).catch(() => null))))
      .filter((c): c is Cyclone => c !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm);
    cache = { at: Date.now(), cyclones };
    return cyclones;
  } catch (error) {
    // GDACS ne répond pas : on garde la dernière lecture si elle existe.
    if (cache) return cache.cyclones;
    throw error;
  }
}

const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "numeric", timeZone: "Indian/Mayotte" });

/** Les cyclones en quelques lignes, pour que Tamilya en parle sans rien inventer. */
export async function cyclonesText(): Promise<string> {
  const cyclones = await getCyclones();
  if (!cyclones.length) {
    return "Cyclones (GDACS, d'après Météo-France La Réunion) : aucun cyclone ni système en formation suivi en ce moment dans le sud-ouest de l'océan Indien.";
  }
  return [
    "Cyclones en cours dans le sud-ouest de l'océan Indien (GDACS, d'après Météo-France La Réunion) :",
    ...cyclones.map(
      (c) =>
        `- ${c.name}${c.forming ? " (en formation, pas encore nommé)" : ""} : ${c.status.toLowerCase()}` +
        `${c.windKmh ? `, vents jusqu'à ${c.windKmh} km/h` : ""}, à ${c.distanceKm} km de Mayotte` +
        (c.closest ? ` ; au plus près selon la prévision : ${c.closest.km} km, le ${day.format(new Date(c.closest.at))}` : ""),
    ),
    "Ce sont des prévisions : pour les alertes officielles, la préfecture de Mayotte et Météo-France.",
  ].join("\n");
}

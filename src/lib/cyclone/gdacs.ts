import "server-only";
import { unstable_cache } from "next/cache";
import { estimate } from "./engine";
import { MAYOTTE, type Cyclone, type CyclonePoint } from "./intent";
import { ageHours, motionOf, STALE_AFTER_H } from "./motion";

/**
 * Cyclones en cours dans le sud-ouest de l'océan Indien, lus sur GDACS
 * (service gratuit de l'ONU et de l'Union européenne, sans clé). Pour notre
 * bassin, GDACS reprend les données de Météo-France La Réunion (« RSMC ») :
 * les systèmes numérotés mais pas encore nommés (en formation) y sont aussi.
 *
 * Rapide : on ne demande que les cyclones des 10 derniers jours (10 Ko au lieu
 * de 136 Ko pour tous les risques du monde), et le résultat allégé (≈ 5 Ko au
 * lieu de 200 Ko de géométrie) est gardé 15 minutes par Next, partagé entre
 * toutes les personnes. Passé ce délai, la dernière version est encore
 * servie tout de suite et la nouvelle est lue derrière : seule la toute
 * première demande attend GDACS. Rien ne tourne quand personne ne demande.
 */

const SEARCH = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH";
const CACHE_S = 15 * 60;
const CACHE_MS = CACHE_S * 1000;
/** La géométrie du trajet met souvent plus de 10 s à venir de GDACS. */
const TIMEOUT_MS = 20_000;

/** Zone voulue : l'océan Indien autour de Mayotte (par défaut), ou le monde entier (sur demande). */
export type CycloneZone = "ocean-indien" | "monde";

const memory = new Map<CycloneZone, { at: number; cyclones: Cyclone[] }>();

type Feature = {
  geometry: { type: string; coordinates: unknown };
  properties: Record<string, unknown>;
};
type Collection = { features?: Feature[] };

const get = async (url: string) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "application/json" } });
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

/** Zone d'incertitude allégée : un point sur trois, au centième de degré (≈ 1 km) près. */
function lighten(ring: number[][]): [number, number][] {
  const step = ring.length > 90 ? 3 : 1;
  const kept = ring.filter((_, i) => i % step === 0 || i === ring.length - 1);
  return kept.map(([lng, lat]) => [Math.round(lng * 100) / 100, Math.round(lat * 100) / 100]);
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
        cone = (f.geometry.coordinates as number[][][]).map(lighten);
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

  const windKmh = typeof severity.severity === "number" ? Math.round(severity.severity) : null;
  const distanceKm = kmBetween(MAYOTTE, now);
  return {
    id: String(p.eventid),
    name,
    forming,
    status: statusOf(String(severity.severitytext ?? "")),
    windKmh,
    now,
    track,
    cone,
    distanceKm,
    closest: nearest,
    mayotteInCone: cone ? inside(MAYOTTE, cone) : null,
    link: url.report?.startsWith("https://www.gdacs.org/") ? url.report : "https://www.gdacs.org/",
    // Estimation BTM : seulement dans notre bassin (l'archive ne couvre que le sud-ouest de l'océan Indien).
    estimate: distanceKm <= 3000 ? safely(() => estimate({ now, track, windKmh })) : null,
  };
}

/** Une erreur du moteur ne doit jamais empêcher d'afficher la carte. */
function safely<T>(run: () => T): T | null {
  try {
    return run();
  } catch (error) {
    console.error("[cyclones] estimation impossible", error);
    return null;
  }
}

/** Le point est-il dans le polygone (anneaux en [lng, lat]) ? Règle du rayon qui croise les bords. */
function inside(p: { lat: number; lng: number }, rings: [number, number][][]): boolean {
  let hit = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

/** Lecture chez GDACS (lente), sans mémoire. */
async function readCyclones(zone: CycloneZone): Promise<Cyclone[]> {
  const today = new Date();
  const from = new Date(today.getTime() - 10 * 86_400_000);
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const list = await get(`${SEARCH}?eventlist=TC&alertlevel=Green;Orange;Red&fromdate=${ymd(from)}&todate=${ymd(today)}`);
  const events = (list.features ?? []).filter(
    (f) =>
      f.properties.eventtype === "TC" &&
      String(f.properties.iscurrent) === "true" &&
      f.geometry.type === "Point" &&
      (zone === "monde" || inBasin(f.geometry.coordinates as number[])),
  );
  return (await Promise.all(events.slice(0, zone === "monde" ? 12 : 6).map((e) => readCyclone(e).catch(() => null))))
    .filter((c): c is Cyclone => c !== null)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

/** Gardée 15 minutes et partagée par tout le site (cache de données de Next). */
const cachedCyclones = unstable_cache(readCyclones, ["cyclones-gdacs-v4"], { revalidate: CACHE_S });

/** Cyclones en cours (océan Indien par défaut, ou le monde), du plus proche de Mayotte au plus loin. */
export async function getCyclones(zone: CycloneZone = "ocean-indien"): Promise<Cyclone[]> {
  const kept = memory.get(zone);
  if (kept && Date.now() - kept.at < CACHE_MS) return kept.cyclones;
  try {
    // Hors du site (tests, scripts), le cache de Next n'existe pas : lecture directe.
    const cyclones = await cachedCyclones(zone).catch((error: unknown) =>
      String(error).includes("incrementalCache missing") ? readCyclones(zone) : Promise.reject(error),
    );
    memory.set(zone, { at: Date.now(), cyclones });
    return cyclones;
  } catch (error) {
    // GDACS ne répond pas : on garde la dernière lecture si elle existe.
    if (kept) return kept.cyclones;
    throw error;
  }
}

const day = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "numeric", timeZone: "Indian/Mayotte" });

const clock = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

/**
 * Ce que disent les données pour Mayotte, en mots de probabilité. Calculé ici,
 * pas laissé au modèle : la zone d'incertitude (cône) et la distance prévue
 * au plus près suffisent à dire si c'est sûr, possible ou peu probable.
 */
function riskFor(c: Cyclone): string {
  const near = c.closest?.km ?? c.distanceKm;
  if (c.mayotteInCone) return "Mayotte est DANS la zone où il peut passer : un passage près de Mayotte est possible, à surveiller de près";
  if (near <= 300) return "Mayotte est hors de la zone où il peut passer, mais il devrait passer assez près : approche possible, à surveiller";
  if (near <= 700) return "Mayotte est hors de la zone où il peut passer et il devrait rester loin : peu probable qu'il touche Mayotte directement";
  return "très loin de Mayotte selon la prévision : très peu probable qu'il touche Mayotte";
}

/** « Depuis samedi 15 h : 375 km vers l'ouest, 16 km/h, 375 km plus près de Mayotte » (mesuré). */
function movementLine(c: Cyclone): string | null {
  const m = motionOf(c);
  if (!m) return null;
  const toward = m.closerKm > 20 ? `${m.closerKm} km plus près de Mayotte` : m.closerKm < -20 ? `${-m.closerKm} km plus loin de Mayotte` : "à peu près à la même distance de Mayotte";
  return `  Déplacement mesuré (sûr), depuis le ${clock.format(new Date(m.since))} (${m.hours} h) : ${m.movedKm} km vers ${m.direction}, environ ${m.speedKmh} km/h, ${toward}.`;
}

/** Donnée vieille : Tamilya doit le dire, sinon la personne croit qu'il ne bouge pas. */
function ageLine(c: Cyclone): string | null {
  const age = ageHours(c);
  if (age < STALE_AFTER_H) return null;
  return `  ATTENTION : la dernière mesure publiée date de ${Math.round(age)} h. Il a sûrement bougé depuis ; le dire clairement et renvoyer vers Météo-France La Réunion pour la position du moment.`;
}

/** L'estimation BTM (moteur des anciens cyclones), présentée comme un deuxième avis. */
function estimateLine(c: Cyclone): string | null {
  const e = c.estimate;
  if (!e) return null;
  const basis =
    e.basis === "archives"
      ? `${e.analogs} anciens cyclones semblables depuis 1980 (pas de prévision officielle)`
      : e.basis === "officielle"
        ? "la prévision officielle et ses erreurs habituelles"
        : `la prévision officielle et ses erreurs habituelles, croisée avec ${e.analogs} anciens cyclones semblables depuis 1980`;
  const like = e.examples.length ? ` Anciens cyclones les plus ressemblants : ${e.examples.map((x) => `${x.name} (${x.year}), dont le trajet reporté à sa position passerait à ${x.closestKm} km`).join(" ; ")}.` : "";
  return [
    `  Estimation BTM (calcul maison, un deuxième avis, PAS une alerte officielle ; d'après ${basis}) sur les 5 jours :`,
    `  ${e.within100} % de chances de passer à moins de 100 km de Mayotte, ${e.within200} % à moins de 200 km, ${e.within300} % à moins de 300 km.`,
    e.when
      ? Date.parse(e.when) > Date.now()
        ? `  S'il s'approche, le plus probable : ${day.format(new Date(e.when))}.`
        : `  Le moment le plus probable du passage au plus près (${day.format(new Date(e.when))}) est déjà passé : la dernière mesure est trop vieille, ces chiffres ne valent plus pour maintenant.`
      : "",
    `  Distance au plus près la plus probable : ${e.typicalKm} km.${like}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Les cyclones en quelques lignes, pour que Tamilya en parle sans rien
 * inventer : ce qui est mesuré (sûr), ce qui est prévu (moins sûr), et le
 * niveau de risque pour Mayotte. Les effets (pluie, vent, houle, alertes)
 * ne sont pas dans ces données : seuls les journaux ou les sources officielles
 * peuvent les donner.
 */
export async function cyclonesText(): Promise<string> {
  const cyclones = await getCyclones();
  if (!cyclones.length) {
    return "Cyclones (GDACS, d'après Météo-France La Réunion) : sûr, aucun cyclone ni système en formation suivi en ce moment dans le sud-ouest de l'océan Indien.";
  }
  return [
    "Cyclones en cours dans le sud-ouest de l'océan Indien (GDACS, d'après Météo-France La Réunion) :",
    ...cyclones.map((c) =>
      [
        `- ${c.name}${c.forming ? " (en formation, pas encore nommé)" : ""}.`,
        `  Mesuré (sûr), le ${clock.format(new Date(c.now.at))} : ${c.status.toLowerCase()}${c.windKmh ? `, vents jusqu'à ${c.windKmh} km/h` : ""}, à ${c.distanceKm} km de Mayotte.`,
        c.closest
          ? `  Prévu (moins sûr, d'autant plus loin dans le temps) : au plus près de Mayotte ${c.closest.km} km, le ${day.format(new Date(c.closest.at))}.`
          : "  Pas de trajet prévu donné.",
        `  Risque pour Mayotte selon ces données : ${riskFor(c)}.`,
        movementLine(c),
        ageLine(c),
        estimateLine(c),
      ]
        .filter(Boolean)
        .join("\n"),
    ),
    "Ces données ne disent rien de la pluie, du vent ou de la mer à Mayotte, ni des alertes : seuls les articles des journaux ci-dessous (s'il y en a) ou la préfecture et Météo-France peuvent le dire.",
  ].join("\n");
}

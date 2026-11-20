import { mayotteDate, sayWhen, sectorNow, waterKey, type WaterAlert, type WaterPlanning, type WaterState } from "./schedule";
import { findZone, villagesAway, WATER_ZONES } from "./zones";

/**
 * Ce que montre la carte de l'eau : un point par lieu, avec son état à l'heure dite.
 * - eau : le planning officiel dit que l'eau est ouverte ;
 * - coupee : fermée d'après le planning, ou coupure annoncée par la SMAE (alerte) ;
 * - inconnu : pas d'information officielle (lieu absent du planning, ou pas de planning ce jour-là).
 */

export type WaterSpot = {
  name: string;
  lat: number;
  lng: number;
  state: WaterState;
  /** Secteur SMAE (« 1 »…), null si le lieu n'est pas dans le planning. */
  sector: string | null;
  /** Une phrase : « De l'eau jusqu'à demain à 16 h. » */
  detail: string;
};

export type WaterMapData = {
  spots: WaterSpot[];
  /** Planning utilisé, null s'il n'y en a pas pour aujourd'hui. */
  period: { from: string; to: string } | null;
  source: string;
  /** Calculé le… (ISO). */
  at: string;
  /** Noms du planning qu'on ne sait pas encore placer (montrés aux administrateurs). */
  unplaced: string[];
};

const NO_PLANNING = "Pas de planning officiel de la SMAE pour aujourd'hui.";
const NOT_LISTED = "La SMAE n'en parle pas dans son planning.";

/** Alerte en cours pour ce lieu (même nom simplifié, ou même point sur la carte). */
function alertFor(name: string, alerts: readonly WaterAlert[], now: number): WaterAlert | null {
  const key = waterKey(name);
  const zone = findZone(name);
  return (
    alerts.find(
      (a) =>
        Date.parse(a.from) <= now &&
        now < Date.parse(a.until) &&
        a.places.some((p) => waterKey(p) === key || (zone !== null && findZone(p) === zone)),
    ) ?? null
  );
}

function sectorDetail(planning: WaterPlanning, sector: string, now: number): { state: WaterState; detail: string } {
  const s = sectorNow(planning, sector, now);
  if (s.state === "inconnu") return { state: "inconnu", detail: NO_PLANNING };
  const until = s.next ? sayWhen(s.next.at, now) : null;
  if (s.state === "eau") {
    const arriving = s.arriving ? "L'eau revient (la SMAE ouvre entre 10 h et 12 h, elle peut tarder à arriver). " : "";
    return { state: "eau", detail: `${arriving}De l'eau${until ? ` jusqu'à ${until} (coupure entre 16 h et 18 h)` : ""}.` };
  }
  return { state: "coupee", detail: `Pas d'eau${until ? `, retour prévu ${until} (entre 10 h et 12 h)` : ""}.` };
}

/** La carte à l'instant `now` (ms), à partir du planning validé (ou null) et des alertes. */
export function buildWaterMap(planning: WaterPlanning | null, alerts: readonly WaterAlert[], now = Date.now()): WaterMapData {
  const today = mayotteDate(now);
  const usable = planning && planning.from <= today && today <= planning.to ? planning : null;
  const spots: WaterSpot[] = [];
  const unplaced: string[] = [];
  const seen = new Set<string>();

  if (usable) {
    for (const sector of usable.sectors) {
      const base = sectorDetail(usable, sector.id, now);
      for (const name of sector.villages) {
        const zone = findZone(name);
        if (!zone) {
          unplaced.push(name);
          continue;
        }
        if (seen.has(zone.name)) continue;
        seen.add(zone.name);
        const alert = alertFor(name, alerts, now);
        spots.push({
          name,
          lat: zone.lat,
          lng: zone.lng,
          sector: sector.id,
          ...(alert
            ? { state: "coupee" as const, detail: `Coupure annoncée par la SMAE${alert.note ? ` : ${alert.note}` : ""}, jusqu'à ${sayWhen(Date.parse(alert.until), now)} au moins.` }
            : base),
        });
      }
    }
  }

  // Lieux du site dont le planning ne parle pas : hachurés.
  const others = usable ? WATER_ZONES.filter((z) => !seen.has(z.name)) : WATER_ZONES;
  for (const zone of others) {
    const alert = alertFor(zone.name, alerts, now);
    spots.push({
      name: zone.name,
      lat: zone.lat,
      lng: zone.lng,
      sector: null,
      ...(alert ? { state: "coupee" as const, detail: `Coupure annoncée par la SMAE${alert.note ? ` : ${alert.note}` : ""}.` } : { state: "inconnu" as const, detail: usable ? NOT_LISTED : NO_PLANNING }),
    });
  }
  for (const village of villagesAway(spots)) spots.push({ ...village, sector: null, state: "inconnu", detail: usable ? NOT_LISTED : NO_PLANNING });

  return { spots, period: usable ? { from: usable.from, to: usable.to } : null, source: usable?.source ?? "", at: new Date(now).toISOString(), unplaced };
}

/** Nom court d'un lieu pour le reconnaître dans une phrase : « Koungou village » → koungou, « Labattoir – Centre » → labattoir. */
const shortKey = (name: string) => waterKey(name.replace(/\b(village|quartier)\b/gi, "").replace(/\(.*?\)|\s[–-]\s.*$/g, ""));

/** Lieux de la carte nommés dans le message (« y a de l'eau à Koungou ? » → Koungou village). */
export function namedSpots(map: WaterMapData, message: string): WaterSpot[] {
  const text = waterKey(message);
  return map.spots.filter((s) => {
    const key = shortKey(s.name);
    // « Labattoir » seul : tous ses quartiers (Centre, Badamiers, La Vigie).
    const town = waterKey(s.name.split(/[\s–(]/)[0]);
    return (key.length >= 4 && text.includes(key)) || (town.length >= 5 && text.includes(town));
  });
}

/** Résumé pour Tamilya : l'état de chaque secteur, et celui des lieux nommés dans le message. */
export function waterSummary(map: WaterMapData, message: string): string {
  if (!map.period) return "Carte de l'eau : aucun planning officiel de la SMAE pour aujourd'hui. Tu ne sais pas où il y a de l'eau : dis-le, et donne le numéro de la SMAE (02 69 61 11 42).";
  const named = namedSpots(map, message);
  const lines = [
    `Carte de l'eau (planning officiel de la SMAE, du ${map.period.from} au ${map.period.to}, calculé maintenant) :`,
    ...[...new Set(map.spots.filter((s) => s.sector).map((s) => s.sector!))].sort().map((id) => {
      const one = map.spots.find((s) => s.sector === id && !s.detail.startsWith("Coupure annoncée"))!;
      return `- Secteur ${id} : ${one?.detail ?? ""}`;
    }),
    ...(named.length ? ["Lieux nommés par la personne :", ...named.slice(0, 8).map((s) => `- ${s.name}${s.sector ? ` (secteur ${s.sector})` : ""} : ${s.detail}`)] : []),
    "Les heures sont celles du planning : l'eau peut arriver plus tard selon le quartier. Fuite d'eau : SMAE au 02 69 61 11 42.",
  ];
  return lines.join("\n");
}

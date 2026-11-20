/**
 * Tours d'eau de la SMAE (Mahoraise des Eaux) : le planning officiel, publié en images sur
 * mahoraisedeseaux.com, lu automatiquement par Gemini dès qu'un nouveau planning est annoncé (/api/cron/eau).
 * Ici : les types et le calcul de l'état de l'eau à une heure donnée. Code commun au serveur
 * et au navigateur, sans appel réseau.
 *
 * Une case du planning (un secteur, un jour) dit ce qui se passe ce jour-là :
 * - « ouverture » : l'eau revient à 10 h (la SMAE ouvre entre 10 h et 12 h) ;
 * - « fermeture » : l'eau est coupée à 16 h (entre 16 h et 18 h) ;
 * - « ferme » : rien ne change, pas d'eau de la journée ;
 * - « journee » : ouvert de 7 h à 17 h (zones industrielles, secteur 4).
 */

export type DayCell = "ouverture" | "fermeture" | "ferme" | "journee";
export const DAY_CELLS: readonly DayCell[] = ["ouverture", "fermeture", "ferme", "journee"];

export type WaterSector = { id: string; villages: string[] };

export type WaterPlanning = {
  /** Premier et dernier jour couverts, « 2026-11-02 » (heure de Mayotte). */
  from: string;
  to: string;
  sectors: WaterSector[];
  /** Un jour par date, dans l'ordre ; cells[id du secteur]. */
  days: { date: string; cells: Record<string, DayCell> }[];
  /** Page de la SMAE, son titre (« Planning des tours d'eau du 02.11.2026 au 22.11.2026 ») et images lues. */
  source: string;
  title: string;
  images: string[];
  /** Lu par Gemini le… (ISO). */
  readAt: string;
};

/** Coupure annoncée hors planning (casse, panne) : ces lieux n'ont pas d'eau jusqu'à `until`. */
export type WaterAlert = { id: string; places: string[]; from: string; until: string; note: string };

export type WaterState = "eau" | "coupee" | "inconnu";

/** Mayotte : UTC+3 toute l'année. */
const OFFSET_MS = 3 * 3600_000;

/** Instant (ms) d'une heure de Mayotte : « 2026-11-02 », 10 → 2026-11-02T07:00Z. */
export const mayotteTime = (date: string, hour: number) => Date.parse(`${date}T00:00:00Z`) + hour * 3600_000 - OFFSET_MS;

/** Date de Mayotte (« 2026-11-20 ») d'un instant. */
export const mayotteDate = (ms: number) => new Date(ms + OFFSET_MS).toISOString().slice(0, 10);

type Change = { at: number; on: boolean };

/** Ouvertures et fermetures d'un secteur sur toute la période, dans l'ordre. */
export function sectorChanges(planning: WaterPlanning, sectorId: string): Change[] {
  const changes: Change[] = [];
  for (const day of planning.days) {
    const cell = day.cells[sectorId];
    if (cell === "ouverture") changes.push({ at: mayotteTime(day.date, 10), on: true });
    else if (cell === "fermeture") changes.push({ at: mayotteTime(day.date, 16), on: false });
    else if (cell === "journee") changes.push({ at: mayotteTime(day.date, 7), on: true }, { at: mayotteTime(day.date, 17), on: false });
  }
  return changes.sort((a, b) => a.at - b.at);
}

export type SectorNow = {
  state: WaterState;
  /** Prochain changement connu (dans la période du planning). */
  next: { on: boolean; at: number } | null;
  /** L'eau vient d'être ouverte (ouverture entre 10 h et 12 h) : elle peut tarder à arriver. */
  arriving: boolean;
};

/** État d'un secteur à l'instant `now` (ms). Hors de la période du planning : inconnu. */
export function sectorNow(planning: WaterPlanning, sectorId: string, now: number): SectorNow {
  const start = mayotteTime(planning.from, 0);
  const end = mayotteTime(planning.to, 24);
  const changes = sectorChanges(planning, sectorId);
  if (now < start || now >= end || !changes.length) return { state: "inconnu", next: null, arriving: false };
  const past = changes.filter((c) => c.at <= now);
  const last = past[past.length - 1];
  // Avant le premier changement de la période : l'inverse de ce changement (« fermeture 16 h » le 1er jour = eau le matin).
  const on = last ? last.on : !changes[0].on;
  const next = changes.find((c) => c.at > now) ?? null;
  const arriving = Boolean(last?.on && now - last.at < 2 * 3600_000);
  return { state: on ? "eau" : "coupee", next: next ? { on: next.on, at: next.at } : null, arriving };
}

/** Nom simplifié pour comparer : sans accents, apostrophes, tirets ni majuscules. */
export const waterKey = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "");

/** Heure lisible à Mayotte : « vendredi à 16 h », ou « à 16 h » le jour même. */
export function sayWhen(at: number, now: number): string {
  const d = new Date(at + OFFSET_MS);
  const hour = `${d.getUTCHours()} h${d.getUTCMinutes() ? String(d.getUTCMinutes()).padStart(2, "0") : ""}`;
  if (mayotteDate(at) === mayotteDate(now)) return `aujourd'hui à ${hour}`;
  if (mayotteDate(at) === mayotteDate(now + 86_400_000)) return `demain à ${hour}`;
  const day = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][d.getUTCDay()];
  return `${day} ${d.getUTCDate()} à ${hour}`;
}

/** Vérifie un planning (relu de Gemini ou du stockage) ; null s'il est inutilisable. */
export function readPlanning(raw: unknown): WaterPlanning | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<WaterPlanning>;
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (!isDate(p.from) || !isDate(p.to) || p.from > p.to) return null;
  if (!Array.isArray(p.sectors) || !Array.isArray(p.days)) return null;
  const sectors = p.sectors
    .filter((s): s is WaterSector => Boolean(s) && typeof s.id === "string" && Array.isArray(s.villages))
    .map((s) => ({ id: s.id.trim(), villages: s.villages.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim()) }));
  const ids = new Set(sectors.map((s) => s.id));
  const days = p.days
    .filter((d) => d && isDate(d.date) && d.cells && typeof d.cells === "object")
    .map((d) => ({
      date: d.date,
      cells: Object.fromEntries(Object.entries(d.cells).filter(([id, c]) => ids.has(id) && DAY_CELLS.includes(c as DayCell))) as Record<string, DayCell>,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!sectors.length || !days.length) return null;
  return {
    from: p.from,
    to: p.to,
    sectors,
    days,
    source: typeof p.source === "string" ? p.source : "",
    title: typeof p.title === "string" ? p.title : "",
    images: Array.isArray(p.images) ? p.images.filter((i): i is string => typeof i === "string") : [],
    readAt: typeof p.readAt === "string" ? p.readAt : new Date().toISOString(),
  };
}

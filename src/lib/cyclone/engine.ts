import "server-only";
import archive from "./archive.json";
import { MAYOTTE, type Cyclone, type CycloneEstimate, type CyclonePoint } from "./intent";
import { km } from "./motion";

/**
 * Moteur d'estimation BTM : « va-t-il passer près de Mayotte, et quand ? »
 *
 * Deux avis, mélangés :
 *
 * 1. La prévision officielle (Météo-France La Réunion, via GDACS), avec ses
 *    erreurs habituelles : à 24 h elle se trompe en moyenne de 70 km, à 72 h
 *    de 150 km, à 120 h de 260 km. On fait donc glisser le trajet prévu dans
 *    toutes les directions, d'autant plus loin que l'échéance est lointaine,
 *    et on compte (avec les bons poids) combien de ces trajets frôlent Mayotte.
 *
 * 2. Les anciens cyclones (archive IBTrACS depuis 1980, 443 systèmes) : on
 *    cherche ceux qui étaient au même endroit, allaient dans la même direction,
 *    à la même vitesse, à la même saison et avec un vent proche ; on reporte
 *    leurs 5 jours suivants à la position actuelle et on regarde lesquels
 *    passent près de Mayotte.
 *
 * Quand la prévision officielle existe, elle compte pour 70 % (elle voit
 * l'atmosphère du moment, l'archive non) ; sinon l'archive seule. Tout est
 * calculé sans hasard : mêmes données, même résultat.
 *
 * Le réglage des poids est vérifié sur 40 ans de cyclones (backtest() plus bas
 * et scripts/cyclone-backtest.ts) : l'archive seule fait mieux que « la
 * moyenne des saisons ».
 */

const H = 3_600_000;
/** Les 5 jours qui suivent la dernière mesure. */
const HORIZON_H = 120;
/** Vitesse mesurée sur 12 h (meilleur résultat sur l'archive que 24 h). Un système qui se forme bouge par à-coups : la recherche s'élargit alors (analogsFor). */
const VELOCITY_H = 12;

/* -------------------------------------------------------------------------- */
/* Géométrie : un plan en km centré sur Mayotte                               */
/* -------------------------------------------------------------------------- */

const COS_M = Math.cos((MAYOTTE.lat * Math.PI) / 180);
const toXY = (p: { lat: number; lng: number }): [number, number] => [(p.lng - MAYOTTE.lng) * 111.32 * COS_M, (p.lat - MAYOTTE.lat) * 110.57];
const toLngLat = ([x, y]: [number, number]): [number, number] => [
  Math.round((MAYOTTE.lng + x / (111.32 * COS_M)) * 100) / 100,
  Math.round((MAYOTTE.lat + y / 110.57) * 100) / 100,
];

type Track = { xy: [number, number][]; t: number[] };

/** Plus courte distance entre Mayotte (0, 0) et le trajet (segments, pas seulement les points), et à quelle heure. */
export function closestOf(track: Track): { km: number; t: number } {
  let best = { km: Infinity, t: track.t[0] ?? 0 };
  const { xy, t } = track;
  if (xy.length === 1) return { km: Math.hypot(...xy[0]), t: t[0] };
  for (let i = 1; i < xy.length; i++) {
    const [ax, ay] = xy[i - 1];
    const [bx, by] = xy[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const k = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
    const d = Math.hypot(ax + dx * k, ay + dy * k);
    if (d < best.km) best = { km: d, t: t[i - 1] + (t[i] - t[i - 1]) * k };
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Archive des anciens cyclones                                               */
/* -------------------------------------------------------------------------- */

type Old = { id: string; name: string; season: number; h: number[]; lat: number[]; lng: number[]; kt: number[] };

const OLD: Old[] = (archive as { storms: { id: string; name: string; season: number; t0: number; p: number[] }[] }).storms.map((s) => {
  const o: Old = { id: s.id, name: s.name, season: s.season, h: [], lat: [], lng: [], kt: [] };
  for (let i = 0; i < s.p.length; i += 4) {
    o.h.push(s.t0 + s.p[i]);
    o.lat.push(s.p[i + 1] / 10);
    o.lng.push(s.p[i + 2] / 10);
    o.kt.push(s.p[i + 3]);
  }
  return o;
});

/** État du cyclone suivi, ce que l'on compare aux anciens. */
export type State = {
  lat: number;
  lng: number;
  /** Heure de la dernière mesure (ms). */
  t: number;
  /** Déplacement des 12 dernières heures environ, en km/h (vers l'est, vers le nord). */
  vx: number;
  vy: number;
  /** Vent le plus fort, en km/h (null : inconnu). */
  windKmh: number | null;
};

/** Réglages du choix des anciens cyclones (écarts « normaux » : au-delà, la ressemblance chute vite). */
export type Tuning = { posKm: number; speedKmh: number; days: number; windKmh: number; keep: number };
/**
 * Choisi sur 40 ans (scripts/cyclone-backtest.ts, 1 120 situations de 1990 à 2026) : passage
 * à moins de 200 km, 21 % mieux que la moyenne des saisons ; à moins de 300 km, 32 % mieux.
 * À moins de 100 km, l'archive seule ne fait pas mieux que la moyenne (trop peu de cas) :
 * c'est la prévision officielle qui compte.
 * La vitesse et la direction comptent le plus (écart de 3 km/h déjà pénalisé).
 */
export const TUNING: Tuning = { posKm: 300, speedKmh: 3, days: 45, windKmh: 60, keep: 50 };

const dayOfYear = (t: number) => {
  const d = new Date(t);
  return (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000;
};

/** Vitesse (km/h vers l'est, vers le nord) entre deux positions. */
function velocity(a: { lat: number; lng: number }, b: { lat: number; lng: number }, hours: number): [number, number] {
  const cos = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
  return [((b.lng - a.lng) * 111.32 * cos) / hours, ((b.lat - a.lat) * 110.57) / hours];
}

type Member = { closest: { km: number; t: number }; weight: number };
type Analog = Member & { old: Old; track: Track };

/** Les anciens cyclones qui ressemblent le plus à l'état donné, avec leurs 5 jours suivants reportés à sa position. */
export function analogsFor(state: State, tuning: Tuning = TUNING, exclude?: string): Analog[] {
  // Trop peu de cousins (système rare, ou qui bouge par à-coups) : on élargit la recherche, deux fois au plus.
  let scored = search(state, tuning, exclude);
  for (const widen of [1.5, 2.25]) {
    if (scored.length >= MIN_ANALOGS) break;
    scored = search(state, { ...tuning, posKm: tuning.posKm * widen, speedKmh: tuning.speedKmh * widen, days: tuning.days * widen }, exclude);
  }
  const [sx, sy] = toXY(state);
  return scored.slice(0, tuning.keep).map(({ old, i, score }) => {
    // Ses 5 jours suivants, en km depuis sa position d'alors, reportés à la position actuelle.
    const [ox, oy] = toXY({ lat: old.lat[i], lng: old.lng[i] });
    const xy: [number, number][] = [[sx, sy]];
    const t: number[] = [state.t];
    for (let k = i + 1; k < old.h.length && old.h[k] - old.h[i] <= HORIZON_H; k++) {
      const [x, y] = toXY({ lat: old.lat[k], lng: old.lng[k] });
      xy.push([sx + x - ox, sy + y - oy]);
      t.push(state.t + (old.h[k] - old.h[i]) * H);
    }
    const track = { xy, t };
    return { old, track, closest: closestOf(track), weight: Math.exp(-score / 2) };
  });
}

/** Indice du point mesuré environ VELOCITY_H heures avant le point i (au moins 6 h avant), -1 sinon. */
function before(old: Old, i: number) {
  for (let back = VELOCITY_H; back >= 6; back -= 6) {
    const j = old.h.indexOf(old.h[i] - back);
    if (j >= 0) return j;
  }
  return -1;
}

/** Pour chaque ancien cyclone, son moment le plus ressemblant, du plus au moins ressemblant. */
function search(state: State, tuning: Tuning, exclude?: string) {
  const doy = dayOfYear(state.t);
  const scored: { old: Old; i: number; score: number }[] = [];
  for (const old of OLD) {
    if (old.id === exclude) continue;
    let best: { i: number; score: number } | null = null;
    for (let i = 0; i < old.h.length; i++) {
      const dPos = km(state, { lat: old.lat[i], lng: old.lng[i] });
      if (dPos > tuning.posKm * 3) continue;
      const j = before(old, i);
      if (j < 0) continue;
      const [vx, vy] = velocity({ lat: old.lat[j], lng: old.lng[j] }, { lat: old.lat[i], lng: old.lng[i] }, old.h[i] - old.h[j]);
      const dV = Math.hypot(vx - state.vx, vy - state.vy);
      const dd = Math.abs(dayOfYear(old.h[i] * H) - doy);
      const dDay = Math.min(dd, 365 - dd);
      const dWind = state.windKmh !== null && old.kt[i] >= 0 ? Math.abs(old.kt[i] * 1.852 - state.windKmh) : tuning.windKmh / 2;
      const score = (dPos / tuning.posKm) ** 2 + (dV / tuning.speedKmh) ** 2 + (dDay / tuning.days) ** 2 + (dWind / tuning.windKmh) ** 2;
      if (!best || score < best.score) best = { i, score };
    }
    if (best && best.score < 9) scored.push({ old, ...best });
  }
  return scored.sort((a, b) => a.score - b.score);
}

/* -------------------------------------------------------------------------- */
/* Prévision officielle et ses erreurs habituelles                            */
/* -------------------------------------------------------------------------- */

/** Erreur moyenne de position des prévisions de La Réunion (km) selon l'échéance (h). Ordres de grandeur publiés par le centre ces dernières saisons. */
const ERROR_KM: [number, number][] = [
  [0, 20],
  [12, 45],
  [24, 70],
  [48, 110],
  [72, 150],
  [96, 200],
  [120, 260],
];
function errorAt(hours: number) {
  for (let i = 1; i < ERROR_KM.length; i++) {
    const [h0, e0] = ERROR_KM[i - 1];
    const [h1, e1] = ERROR_KM[i];
    if (hours <= h1) return e0 + ((e1 - e0) * Math.max(0, hours - h0)) / (h1 - h0);
  }
  return ERROR_KM[ERROR_KM.length - 1][1];
}

/** Grille régulière de -3 à +3 écarts, pondérée comme une courbe en cloche : 13 × 13 trajets, sans hasard. */
const Z = Array.from({ length: 13 }, (_, i) => -3 + i * 0.5);
const ZW = Z.map((z) => Math.exp((-z * z) / 2));

/** Les trajets possibles autour de la prévision officielle (la position décalée d'autant plus que l'échéance est loin). */
function officialMembers(base: { lat: number; lng: number; at: string }, forecast: readonly CyclonePoint[]): Member[] {
  const pts = [base, ...forecast];
  const t = pts.map((p) => Date.parse(p.at));
  const xy = pts.map(toXY);
  // Erreur moyenne d'une position sur un plan = écart × 1,25.
  const sigma = t.map((ti) => errorAt((ti - t[0]) / H) / 1.25);
  const members: Member[] = [];
  for (let a = 0; a < Z.length; a++) {
    for (let b = 0; b < Z.length; b++) {
      const moved = xy.map(([x, y], k): [number, number] => [x + Z[a] * sigma[k], y + Z[b] * sigma[k]]);
      members.push({ closest: closestOf({ xy: moved, t }), weight: ZW[a] * ZW[b] });
    }
  }
  return members;
}

/* -------------------------------------------------------------------------- */
/* Mélange et résultat                                                        */
/* -------------------------------------------------------------------------- */

const OFFICIAL_SHARE = 0.7;
/** Une prévision officielle qui va à 72 h ou plus pèse pleinement ; à 24 h, trois fois moins. */
const FULL_REACH_H = 72;
const MIN_ANALOGS = 8;

function weightedMedian(values: { v: number; w: number }[]) {
  const sorted = [...values].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((s, x) => s + x.w, 0);
  let acc = 0;
  for (const x of sorted) {
    acc += x.w;
    if (acc >= total / 2) return x.v;
  }
  return sorted[sorted.length - 1]?.v ?? 0;
}

/** Chances (0 à 1) de passer à moins de r km, parmi des trajets pondérés. */
const share = (members: Member[], r: number) => {
  const total = members.reduce((s, m) => s + m.weight, 0);
  return total ? members.filter((m) => m.closest.km < r).reduce((s, m) => s + m.weight, 0) / total : 0;
};

/** Vitesse actuelle : sur les 12 dernières heures mesurées (sinon la première étape prévue). */
export function stateOf(c: Pick<Cyclone, "now" | "track" | "windKmh">): State {
  const done = c.track.filter((p) => !p.forecast);
  const last = done[done.length - 1] ?? { ...c.now, forecast: false };
  const lastT = Date.parse(last.at);
  const earlier = done.filter((p) => lastT - Date.parse(p.at) >= 6 * H);
  const ref = earlier.find((p) => lastT - Date.parse(p.at) <= VELOCITY_H * H) ?? earlier[earlier.length - 1];
  const next = c.track.find((p) => p.forecast);
  let v: [number, number] = [0, 0];
  if (ref) v = velocity(ref, last, (lastT - Date.parse(ref.at)) / H);
  else if (next) v = velocity(last, next, (Date.parse(next.at) - lastT) / H || 1);
  return { lat: last.lat, lng: last.lng, t: lastT, vx: v[0], vy: v[1], windKmh: c.windKmh };
}

/** L'estimation BTM pour un cyclone suivi. null : trop loin de tout repère (ni prévision, ni anciens cyclones semblables). */
export function estimate(c: Pick<Cyclone, "now" | "track" | "windKmh">): CycloneEstimate | null {
  const state = stateOf(c);
  const analogs = analogsFor(state);
  const forecast = c.track.filter((p) => p.forecast && Date.parse(p.at) - state.t <= HORIZON_H * H);
  const official = forecast.length ? officialMembers({ lat: state.lat, lng: state.lng, at: new Date(state.t).toISOString() }, forecast) : [];
  const useAnalogs = analogs.length >= MIN_ANALOGS;
  if (!official.length && !useAnalogs) return null;

  // Chaque avis est ramené à un total de 1, puis pondéré : 70 % officiel, 30 % archive. Une prévision
  // officielle courte (24 h pour un système qui se forme) ne dit rien d'après : elle pèse d'autant moins.
  const norm = (ms: Member[], part: number) => {
    const total = ms.reduce((s, m) => s + m.weight, 0) || 1;
    return ms.map((m) => ({ ...m, weight: (m.weight / total) * part }));
  };
  const reachH = forecast.length ? (Date.parse(forecast[forecast.length - 1].at) - state.t) / H : 0;
  const officialShare = OFFICIAL_SHARE * Math.min(1, reachH / FULL_REACH_H);
  const members =
    official.length && useAnalogs ? [...norm(official, officialShare), ...norm(analogs, 1 - officialShare)] : official.length ? norm(official, 1) : norm(analogs, 1);

  const near = members.filter((m) => m.closest.km < 300);
  const pct = (r: number) => Math.round(share(members, r) * 100);
  const within300 = pct(300);
  return {
    within100: pct(100),
    within200: pct(200),
    within300,
    // À l'heure ronde : une minute près n'a pas de sens pour un cyclone.
    when: within300 >= 5 && near.length ? new Date(Math.round(weightedMedian(near.map((m) => ({ v: m.closest.t, w: m.weight }))) / H) * H).toISOString() : null,
    typicalKm: Math.round(weightedMedian(members.map((m) => ({ v: m.closest.km, w: m.weight })))),
    basis: official.length && useAnalogs ? "officielle+archives" : official.length ? "officielle" : "archives",
    analogs: useAnalogs ? analogs.length : 0,
    examples: useAnalogs
      ? analogs
          .filter((a) => a.old.name)
          .slice(0, 3)
          .map((a) => ({ name: a.old.name, year: a.old.season, closestKm: Math.round(a.closest.km) }))
      : [],
    spread: useAnalogs ? analogs.slice(0, 15).map((a) => a.track.xy.map(toLngLat)) : [],
  };
}

/* -------------------------------------------------------------------------- */
/* Vérification sur 40 ans de cyclones                                        */
/* -------------------------------------------------------------------------- */

export type Backtest = { cases: number; positives: number; brier: number; climatology: number; skill: number };

/**
 * On se replace à des moments passés (un cyclone entre 300 et 1 500 km de
 * Mayotte), on demande à l'archive (sans ce cyclone-là) s'il passera à moins
 * de `radiusKm`, puis on compare à ce qu'il a vraiment fait. Score de Brier :
 * 0 = parfait ; « climatology » = score en donnant toujours la moyenne.
 * skill > 0 : le moteur fait mieux que la moyenne.
 */
export function backtest({ radiusKm = 200, fromSeason = 1990, tuning = TUNING }: { radiusKm?: number; fromSeason?: number; tuning?: Tuning } = {}): Backtest {
  const cases: { p: number; hit: number }[] = [];
  for (const old of OLD) {
    if (old.season < fromSeason) continue;
    let lastUsed = -Infinity;
    for (let i = 0; i < old.h.length; i++) {
      // Un cas toutes les 24 h au plus, avec assez de passé pour connaître sa vitesse.
      if (old.h[i] - lastUsed < 24) continue;
      const j = before(old, i);
      if (j < 0) continue;
      const here = { lat: old.lat[i], lng: old.lng[i] };
      const dist = km(MAYOTTE, here);
      if (dist < 300 || dist > 1500) continue;
      lastUsed = old.h[i];
      const [vx, vy] = velocity({ lat: old.lat[j], lng: old.lng[j] }, here, old.h[i] - old.h[j]);
      const state: State = { ...here, t: old.h[i] * H, vx, vy, windKmh: old.kt[i] >= 0 ? old.kt[i] * 1.852 : null };
      const analogs = analogsFor(state, tuning, old.id);
      if (analogs.length < MIN_ANALOGS) continue;
      const total = analogs.reduce((s, a) => s + a.weight, 0);
      const p = analogs.filter((a) => a.closest.km < radiusKm).reduce((s, a) => s + a.weight, 0) / total;
      // Ce qu'il a vraiment fait dans les 5 jours.
      const xy: [number, number][] = [];
      const t: number[] = [];
      for (let k = i; k < old.h.length && old.h[k] - old.h[i] <= HORIZON_H; k++) {
        xy.push(toXY({ lat: old.lat[k], lng: old.lng[k] }));
        t.push(old.h[k]);
      }
      cases.push({ p, hit: closestOf({ xy, t }).km < radiusKm ? 1 : 0 });
    }
  }
  const n = cases.length || 1;
  const base = cases.reduce((s, c) => s + c.hit, 0) / n;
  const brier = cases.reduce((s, c) => s + (c.p - c.hit) ** 2, 0) / n;
  const climatology = cases.reduce((s, c) => s + (base - c.hit) ** 2, 0) / n;
  return {
    cases: cases.length,
    positives: Math.round(base * cases.length),
    brier: Math.round(brier * 10_000) / 10_000,
    climatology: Math.round(climatology * 10_000) / 10_000,
    skill: Math.round((1 - brier / (climatology || 1)) * 1000) / 1000,
  };
}

import { ISLANDS } from "./coast";

/**
 * Découpe Mayotte en zones : chaque endroit de Grande-Terre et de Petite-Terre revient au lieu le
 * plus proche (cellules de Voronoï), découpées dans le vrai contour des deux îles. Les couleurs
 * s'arrêtent au bord de mer, et les îlots restent sans couleur.
 */

type Pt = [number, number];

const LAT0 = -12.82;
const K = Math.cos((LAT0 * Math.PI) / 180);

/**
 * Garde la partie du polygone du côté de `p` par rapport à la médiatrice de p et q. Marche aussi
 * pour un contour creusé (une côte) : là où il sort puis revient, il reste un bord plat sur la
 * médiatrice, sans surface.
 */
function clip(poly: Pt[], p: Pt, q: Pt): Pt[] {
  const nx = q[0] - p[0];
  const ny = q[1] - p[1];
  const c = (q[0] * q[0] + q[1] * q[1] - p[0] * p[0] - p[1] * p[1]) / 2;
  const side = (v: Pt) => v[0] * nx + v[1] * ny - c; // < 0 : côté de p
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const sa = side(a);
    const sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) {
      const t = sa / (sa - sb);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/** Calcul à plat : longitude resserrée par cos(latitude) pour garder des distances justes. */
const flat = (lng: number, lat: number): Pt => [lng * K, lat];
const ISLANDS_FLAT = ISLANDS.map((ring) => {
  const closed = ring[0]![0] === ring.at(-1)![0] && ring[0]![1] === ring.at(-1)![1];
  return (closed ? ring.slice(0, -1) : ring).map(([lng, lat]) => flat(lng, lat));
});

/**
 * Une zone par lieu, dans le même ordre : liste d'anneaux fermés [lng, lat] (un par île touchée),
 * ou `null` pour un lieu en double (même position qu'un précédent) ou sans terre à lui.
 */
export function waterCells(points: readonly { lat: number; lng: number }[]): ([number, number][][] | null)[] {
  const xy = points.map((p) => flat(p.lng, p.lat));
  const seen = new Set<string>();
  return xy.map((p, i) => {
    const key = `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const rings: [number, number][][] = [];
    for (const island of ISLANDS_FLAT) {
      let poly = island;
      for (let j = 0; j < xy.length && poly.length; j++) {
        const q = xy[j]!;
        if (j === i || (q[0] === p[0] && q[1] === p[1])) continue;
        poly = clip(poly, p, q);
      }
      if (poly.length < 3) continue;
      const ring = poly.map(([x, y]): [number, number] => [x / K, y]);
      ring.push(ring[0]!);
      rings.push(ring);
    }
    return rings.length ? rings : null;
  });
}

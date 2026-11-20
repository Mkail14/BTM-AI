/**
 * Découpe Mayotte en zones : chaque endroit revient au lieu le plus proche (cellules de Voronoï).
 * La carte peint ces zones sous la mer du fond de carte : la mer les recoupe au bord de l'eau,
 * et toute l'île apparaît colorée, village par village.
 */

type Pt = [number, number];

/** Cadre découpé : Mayotte entière avec de la marge (lng, lat). */
const FRAME: [Pt, Pt] = [
  [44.85, -13.15],
  [45.45, -12.5],
];
const LAT0 = -12.82;
const K = Math.cos((LAT0 * Math.PI) / 180);

/** Garde la partie du polygone du côté de `p` par rapport à la médiatrice de p et q. */
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

/**
 * Une zone (anneau fermé [lng, lat]) par lieu, dans le même ordre ; `null` pour un lieu en double
 * (même position qu'un précédent) ou hors du cadre.
 */
export function waterCells(points: readonly { lat: number; lng: number }[]): ([number, number][] | null)[] {
  // Calcul à plat : longitude resserrée par cos(latitude) pour garder des distances justes.
  const xy = points.map((p): Pt => [p.lng * K, p.lat]);
  const box: Pt[] = [
    [FRAME[0][0] * K, FRAME[0][1]],
    [FRAME[1][0] * K, FRAME[0][1]],
    [FRAME[1][0] * K, FRAME[1][1]],
    [FRAME[0][0] * K, FRAME[1][1]],
  ];
  const seen = new Set<string>();
  return xy.map((p, i) => {
    const key = `${p[0].toFixed(6)},${p[1].toFixed(6)}`;
    if (seen.has(key) || p[0] < box[0]![0] || p[0] > box[1]![0] || p[1] < box[0]![1] || p[1] > box[2]![1]) return null;
    seen.add(key);
    let poly = box;
    for (let j = 0; j < xy.length && poly.length; j++) {
      const q = xy[j]!;
      if (j === i || (q[0] === p[0] && q[1] === p[1])) continue;
      poly = clip(poly, p, q);
    }
    if (poly.length < 3) return null;
    const ring = poly.map(([x, y]): [number, number] => [x / K, y]);
    ring.push(ring[0]!);
    return ring;
  });
}

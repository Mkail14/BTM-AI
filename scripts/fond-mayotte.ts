/**
 * Génère public/fond/mayotte.svg : la portion du fond « lagon » où les traits
 * dessinent Mayotte. Mêmes courbes que public/fond/lagon.svg (même relief, mêmes
 * niveaux), sur deux motifs de haut (640 × 1280, se pose exactement sur le fond).
 *
 * Mayotte est une petite bosse ajoutée au relief : un trait qui arrive dessus change
 * de route en douceur et rejoint la côte, qu'un seul trait suit de bout en bout, puis
 * il repart et retrouve son chemin. La bosse reste basse pour garder l'écart entre
 * les traits du fond. L'intérieur de l'île est laissé vide.
 *
 * Côte : OpenStreetMap (© les contributeurs OpenStreetMap, licence ODbL).
 *
 *   node --import tsx scripts/fond-mayotte.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

type Pt = [number, number];
type Way = { id: number; nodes: number[]; geometry: { lat: number; lon: number }[] };

const TILE = 640; // motif du fond, en px
const N = 128; // grille de scripts/fond-lagon.ts : sert à retrouver ses niveaux
const LEVELS = 9;
const SUB = 4; // grille 4 fois plus fine que le fond : la côte a besoin de détail
const CELL = TILE / N / SUB; // px
const WIDTH = TILE;
const HEIGHT = TILE * 2;
const ISLAND_HEIGHT = 540; // px
const ISLAND_CENTER: Pt = [330, 470]; // px, dans le dessin
const COAST_SMOOTH = 4; // gomme le détail de la côte, en cases
const RISE = 1.25; // hauteur de la bosse, en niveaux : plus c'est haut, plus les traits se serrent
const REACH = 44; // distance à la côte où les traits commencent à dévier, en px
const STEEP = 1.6; // plus c'est grand, plus les traits se serrent contre la côte
const MIN_PIECE = 22; // bouts de trait plus courts retirés, en px
const FADE = 100; // fondu du bord gauche, en px (raccord avec le motif)
const TOLERANCE = 0.45; // simplification des traits, en px
const MIN_ISLAND_KM2 = 1; // Grande-Terre, Petite-Terre et les plus gros îlots
const BBOX = "-13.1,44.9,-12.55,45.4"; // sud, ouest, nord, est
const KM_PER_LAT = 110.6;
const KM_PER_LON = 108.4;

// Relief identique à scripts/fond-lagon.ts (même graine, même tirage).
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const waves = Array.from({ length: 10 }, () => {
  const kx = Math.floor(rand() * 5) - 2;
  const ky = kx === 0 ? Math.floor(rand() * 3) + 1 : Math.floor(rand() * 4);
  return { kx, ky, amp: 1 / Math.hypot(kx, ky) ** 1.4, phase: rand() * Math.PI * 2 };
});
const relief = (x: number, y: number) => waves.reduce((s, w) => s + w.amp * Math.sin(2 * Math.PI * (w.kx * x + w.ky * y) + w.phase), 0);

async function fetchCoast(): Promise<Way[]> {
  const cache = join(tmpdir(), "mayotte-cote.json");
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  const query = `[out:json][timeout:60];way["natural"="coastline"](${BBOX});out body geom;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "fond-mayotte-script" },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!response.ok) throw new Error(`Overpass : ${response.status}`);
  const { elements } = (await response.json()) as { elements: Way[] };
  writeFileSync(cache, JSON.stringify(elements));
  return elements;
}

/** Les bouts de côte d'OpenStreetMap, raboutés en îles fermées (coordonnées en km). */
function islands(ways: Way[]): Pt[][] {
  const lat0 = -12.8;
  const lon0 = 45.15;
  const project = (lat: number, lon: number): Pt => [(lon - lon0) * KM_PER_LON, (lat0 - lat) * KM_PER_LAT];
  const open = ways.map((way) => ({ first: way.nodes[0], last: way.nodes[way.nodes.length - 1], points: way.geometry.map((g) => project(g.lat, g.lon)) }));
  const rings: Pt[][] = [];
  while (open.length) {
    const ring = open.pop()!;
    for (;;) {
      if (ring.first === ring.last) {
        rings.push(ring.points);
        break;
      }
      const next = open.findIndex((way) => way.first === ring.last);
      if (next < 0) break; // Côte coupée par le cadre : hors de Mayotte.
      const [way] = open.splice(next, 1);
      ring.points.push(...way.points.slice(1));
      ring.last = way.last;
    }
  }
  const area = (ring: Pt[]) =>
    Math.abs(
      ring.reduce((sum, [x, y], i) => {
        const [nx, ny] = ring[(i + 1) % ring.length];
        return sum + x * ny - nx * y;
      }, 0),
    ) / 2;
  return rings.filter((ring) => area(ring) >= MIN_ISLAND_KM2);
}

/** Flou (boîte, plusieurs passages) d'une grille. */
function blur(grid: number[][], radius: number, passes: number) {
  const blurRows = (rows: number[][]) =>
    rows.map((row) =>
      row.map((_, i) => {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) sum += row[Math.max(0, Math.min(row.length - 1, i + k))];
        return sum / (radius * 2 + 1);
      }),
    );
  const flip = (rows: number[][]) => rows[0].map((_, i) => rows.map((row) => row[i]));
  let soft = grid;
  for (let pass = 0; pass < passes; pass++) soft = flip(blurRows(flip(blurRows(soft))));
  return soft;
}

/** Distance à la terre la plus proche, en cases (0 sur la terre). */
function distanceToLand(land: boolean[][]) {
  const rows = land.length;
  const cols = land[0].length;
  const away = land.map((row) => row.map((isLand) => (isLand ? 0 : Infinity)));
  const relax = (j: number, i: number, nj: number, ni: number, cost: number) => {
    if (nj >= 0 && nj < rows && ni >= 0 && ni < cols) away[j][i] = Math.min(away[j][i], away[nj][ni] + cost);
  };
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      relax(j, i, j, i - 1, 1);
      relax(j, i, j - 1, i, 1);
      relax(j, i, j - 1, i - 1, Math.SQRT2);
      relax(j, i, j - 1, i + 1, Math.SQRT2);
    }
  }
  for (let j = rows - 1; j >= 0; j--) {
    for (let i = cols - 1; i >= 0; i--) {
      relax(j, i, j, i + 1, 1);
      relax(j, i, j + 1, i, 1);
      relax(j, i, j + 1, i + 1, Math.SQRT2);
      relax(j, i, j + 1, i - 1, Math.SQRT2);
    }
  }
  return away;
}

/** Longueur d'un trait, en px. */
function lengthOf(line: Pt[]) {
  return line.reduce((sum, [x, y], i) => (i ? sum + Math.hypot(x - line[i - 1][0], y - line[i - 1][1]) * CELL : 0), 0);
}

/** 1 dans les îles, 0 en mer : la côte, adoucie, est la courbe 0,5. */
function islandMask(rings: Pt[][], cols: number, rows: number): number[][] {
  const mask = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (const ring of rings) {
    for (let j = 0; j < rows; j++) {
      const y = j * CELL;
      const xs: number[] = [];
      for (let k = 0; k < ring.length; k++) {
        const [ax, ay] = ring[k];
        const [bx, by] = ring[(k + 1) % ring.length];
        if (ay > y !== by > y) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let i = Math.ceil(xs[k] / CELL); i * CELL < xs[k + 1] && i < cols; i++) mask[j][i] = 1;
      }
    }
  }
  return blur(mask, COAST_SMOOTH, 3);
}

/** Courbe de niveau d'une grille, en lignes continues. */
function contour(grid: number[][], level: number): Pt[][] {
  const rows = grid.length;
  const cols = grid[0].length;
  const cross = (i0: number, j0: number, i1: number, j1: number): [string, Pt] => {
    const a = grid[j0][i0];
    const b = grid[j1][i1];
    const k = (level - a) / (b - a);
    return [`${i0},${j0},${i1},${j1}`, [i0 + (i1 - i0) * k, j0 + (j1 - j0) * k]];
  };
  const segments: [string, Pt, string, Pt][] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const c =
        (grid[j][i] > level ? 8 : 0) | (grid[j][i + 1] > level ? 4 : 0) | (grid[j + 1][i + 1] > level ? 2 : 0) | (grid[j + 1][i] > level ? 1 : 0);
      if (c === 0 || c === 15) continue;
      const top = cross(i, j, i + 1, j);
      const right = cross(i + 1, j, i + 1, j + 1);
      const bottom = cross(i, j + 1, i + 1, j + 1);
      const left = cross(i, j, i, j + 1);
      const pairs: Record<number, [string, Pt][][]> = {
        1: [[left, bottom]], 2: [[bottom, right]], 3: [[left, right]], 4: [[top, right]],
        5: [[left, top], [bottom, right]], 6: [[top, bottom]], 7: [[left, top]], 8: [[left, top]],
        9: [[top, bottom]], 10: [[left, bottom], [top, right]], 11: [[top, right]], 12: [[left, right]],
        13: [[bottom, right]], 14: [[left, bottom]],
      };
      for (const [a, b] of pairs[c]) segments.push([a[0], a[1], b[0], b[1]]);
    }
  }
  const byKey = new Map<string, number[]>();
  segments.forEach(([a, , b], index) => {
    for (const key of [a, b]) {
      const list = byKey.get(key);
      if (list) list.push(index);
      else byKey.set(key, [index]);
    }
  });
  const used = new Set<number>();
  const lines: Pt[][] = [];
  for (let s = 0; s < segments.length; s++) {
    if (used.has(s)) continue;
    used.add(s);
    const line: Pt[] = [segments[s][1], segments[s][3]];
    const tail: Pt[] = [];
    for (const forward of [true, false]) {
      let key = forward ? segments[s][2] : segments[s][0];
      for (;;) {
        const next = (byKey.get(key) ?? []).find((n) => !used.has(n));
        if (next === undefined) break;
        used.add(next);
        const [ka, pa, kb, pb] = segments[next];
        const [following, point] = ka === key ? [kb, pb] : [ka, pa];
        (forward ? line : tail).push(point);
        key = following;
      }
    }
    lines.push([...tail.reverse(), ...line]);
  }
  return lines;
}

/** Retire les points qui n'apportent rien (Douglas-Peucker), en px. */
function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length < 3) return points;
  // Boucle fermée : mêmes deux extrémités, la mesure de distance n'aurait plus de sens.
  const [firstX, firstY] = points[0];
  const [lastX, lastY] = points[points.length - 1];
  if (Math.hypot(firstX - lastX, firstY - lastY) < 0.01) {
    const middle = Math.floor(points.length / 2);
    return [...simplify(points.slice(0, middle + 1), tolerance), ...simplify(points.slice(middle), tolerance).slice(1)];
  }
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [from, to] = stack.pop()!;
    const [ax, ay] = points[from];
    const [bx, by] = points[to];
    const dx = bx - ax;
    const dy = by - ay;
    let far = -1;
    let farthest = tolerance;
    for (let i = from + 1; i < to; i++) {
      const [x, y] = points[i];
      // Distance au segment, pas à la droite : une pointe alignée compte aussi.
      const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
      const distance = Math.hypot(x - ax - k * dx, y - ay - k * dy);
      if (distance > farthest) {
        farthest = distance;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = true;
      stack.push([from, far], [far, to]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Même lissage que le fond : milieux et courbes quadratiques. */
function toPath(line: Pt[]) {
  const f = (n: number) => Math.round(n * 10) / 10;
  const points = simplify(
    line.map(([x, y]): Pt => [x * CELL, y * CELL]),
    TOLERANCE,
  );
  if (points.length < 2) return "";
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let k = 1; k < points.length - 1; k++) {
    const [x, y] = points[k];
    const [nx, ny] = points[k + 1];
    d += `Q${f(x)} ${f(y)} ${f((x + nx) / 2)} ${f((y + ny) / 2)}`;
  }
  const last = points[points.length - 1];
  return `${d}L${f(last[0])} ${f(last[1])}`;
}

async function main() {
  // Niveaux exacts du fond : mêmes échantillons que scripts/fond-lagon.ts.
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const v = relief(i / N, j / N);
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }

  // Îles posées sur le dessin, en px.
  const km = islands(await fetchCoast());
  const all = km.flat();
  const west = Math.min(...all.map((p) => p[0]));
  const east = Math.max(...all.map((p) => p[0]));
  const north = Math.min(...all.map((p) => p[1]));
  const south = Math.max(...all.map((p) => p[1]));
  const zoom = ISLAND_HEIGHT / (south - north);
  const rings = km.map((ring) =>
    ring.map(([x, y]): Pt => [ISLAND_CENTER[0] + (x - (west + east) / 2) * zoom, ISLAND_CENTER[1] + (y - (north + south) / 2) * zoom]),
  );

  const cols = Math.round(WIDTH / CELL) + 1;
  const rows = Math.round(HEIGHT / CELL) + 1;
  const mask = islandMask(rings, cols, rows);
  // Bosse : pleine sur la côte et dans l'île, nulle à REACH de la côte.
  const land = mask.map((row) => row.map((v) => v > 0.5));
  const away = distanceToLand(land);
  const bump = blur(
    away.map((row) => row.map((distance) => Math.max(0, 1 - (distance * CELL) / REACH) ** STEEP)),
    1,
    2,
  );
  const step = (max - min) / (LEVELS + 1);
  const grid = bump.map((row, j) => row.map((height, i) => relief((i * CELL) / TILE, (j * CELL) / TILE) + RISE * step * height));
  const onLand = ([x, y]: Pt) => land[Math.round(y)][Math.round(x)];

  const paths: string[] = [];
  // Quelques niveaux de plus que le fond : le relief ne les atteint que sur la bosse.
  for (let l = 1; l <= LEVELS + Math.ceil(RISE); l++) {
    for (const line of contour(grid, min + step * l)) {
      let piece: Pt[] = [];
      for (const point of [...line, null]) {
        if (point && !onLand(point)) {
          piece.push(point);
        } else {
          if (lengthOf(piece) >= MIN_PIECE) paths.push(toPath(piece));
          piece = [];
        }
      }
    }
  }

  for (const line of contour(mask, 0.5)) paths.push(toPath(line));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><linearGradient id="f" gradientUnits="userSpaceOnUse" x1="0" x2="${FADE}" y1="0" y2="0"><stop stop-opacity="0"/><stop offset="1"/></linearGradient><path d="${paths.join("")}" fill="none" stroke="url(#f)" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;
  mkdirSync("public/fond", { recursive: true });
  writeFileSync("public/fond/mayotte.svg", svg);
  console.log(`public/fond/mayotte.svg : ${WIDTH}×${HEIGHT}, ${rings.length} îles, ${(svg.length / 1024).toFixed(1)} Ko`);
}

void main();

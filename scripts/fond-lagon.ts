/**
 * Génère public/fond/lagon.svg : courbes de niveau d'un relief imaginaire,
 * comme une carte des profondeurs du lagon. Le motif se raccorde sur ses
 * quatre bords (relief périodique), on peut donc le répéter à l'infini.
 * Sert de masque (globals.css, .fond-lagon) : seule la forme compte, la
 * couleur vient de la personnalité de Tamilya.
 *
 *   node --import tsx scripts/fond-lagon.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";

const TILE = 640; // taille du motif en px
const N = 128; // finesse de la grille
const LEVELS = 9;

// Relief périodique : somme d'ondes à fréquences entières (raccord parfait aux bords).
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const waves = Array.from({ length: 10 }, () => {
  const kx = Math.floor(rand() * 5) - 2;
  const ky = kx === 0 ? Math.floor(rand() * 3) + 1 : Math.floor(rand() * 4);
  return { kx, ky, amp: 1 / Math.hypot(kx, ky) ** 1.4, phase: rand() * Math.PI * 2 };
});
const height = (x: number, y: number) =>
  waves.reduce((s, w) => s + w.amp * Math.sin(2 * Math.PI * (w.kx * x + w.ky * y) + w.phase), 0);

const grid: number[][] = [];
let min = Infinity;
let max = -Infinity;
for (let j = 0; j < N; j++) {
  grid[j] = [];
  for (let i = 0; i < N; i++) {
    const v = height(i / N, j / N);
    grid[j][i] = v;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
}
const at = (i: number, j: number) => grid[((j % N) + N) % N][((i % N) + N) % N];

type Pt = [number, number];
const paths: string[] = [];

for (let l = 1; l <= LEVELS; l++) {
  const t = min + ((max - min) * l) / (LEVELS + 1);
  // Point de passage sur chaque arête de cellule, identifiée par une clé.
  const cross = (i0: number, j0: number, i1: number, j1: number): [string, Pt] => {
    const a = at(i0, j0);
    const b = at(i1, j1);
    const k = (t - a) / (b - a);
    const key = i0 === i1 ? `v${((i0 % N) + N) % N},${j0 % N}` : `h${i0 % N},${((j0 % N) + N) % N}`;
    return [key, [i0 + (i1 - i0) * k, j0 + (j1 - j0) * k]];
  };
  const segs: [string, Pt, string, Pt][] = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = (at(i, j) > t ? 8 : 0) | (at(i + 1, j) > t ? 4 : 0) | (at(i + 1, j + 1) > t ? 2 : 0) | (at(i, j + 1) > t ? 1 : 0);
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
      for (const [a, b] of pairs[c]) segs.push([a[0], a[1], b[0], b[1]]);
    }
  }

  // Chaînage des segments en lignes continues.
  const byKey = new Map<string, number[]>();
  segs.forEach(([ka, , kb], idx) => {
    for (const k of [ka, kb]) byKey.set(k, [...(byKey.get(k) ?? []), idx]);
  });
  const used = new Set<number>();
  for (let s = 0; s < segs.length; s++) {
    if (used.has(s)) continue;
    used.add(s);
    const line: Pt[] = [segs[s][1], segs[s][3]];
    for (const forward of [true, false]) {
      let key = forward ? segs[s][2] : segs[s][0];
      for (;;) {
        const next = (byKey.get(key) ?? []).find((n) => !used.has(n));
        if (next === undefined) break;
        used.add(next);
        const [ka, pa, kb, pb] = segs[next];
        const [k2, p2] = ka === key ? [kb, pb] : [ka, pa];
        if (forward) line.push(p2);
        else line.unshift(p2);
        key = k2;
      }
    }
    paths.push(toPath(line));
  }
}

/** Lissage (milieux + courbes quadratiques), coupé là où la ligne passe d'un bord du motif à l'autre. */
function toPath(line: Pt[]): string {
  const scale = TILE / N;
  const parts: Pt[][] = [[]];
  line.forEach((p, idx) => {
    const prev = line[idx - 1];
    if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 2) {
      // La ligne sort d'un côté et revient de l'autre : chaque bout dépasse jusqu'au bord, sans trou.
      const dx = Math.round((prev[0] - p[0]) / N) * N;
      const dy = Math.round((prev[1] - p[1]) / N) * N;
      parts[parts.length - 1].push([p[0] + dx, p[1] + dy]);
      parts.push([[prev[0] - dx, prev[1] - dy]]);
    }
    parts[parts.length - 1].push(p);
  });
  const f = (n: number) => Math.round(n * scale * 10) / 10;
  return parts
    .filter((p) => p.length > 1)
    .map((pts) => {
      const simple = pts.filter((_, idx) => idx % 2 === 0 || idx === pts.length - 1);
      let d = `M${f(simple[0][0])} ${f(simple[0][1])}`;
      for (let k = 1; k < simple.length - 1; k++) {
        const [x, y] = simple[k];
        const [nx, ny] = simple[k + 1];
        d += `Q${f(x)} ${f(y)} ${f((x + nx) / 2)} ${f((y + ny) / 2)}`;
      }
      const last = simple[simple.length - 1];
      return d + `L${f(last[0])} ${f(last[1])}`;
    })
    .join("");
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}"><path d="${paths.join("")}" fill="none" stroke="#000" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`;
mkdirSync("public/fond", { recursive: true });
writeFileSync("public/fond/lagon.svg", svg);
console.log(`public/fond/lagon.svg : ${(svg.length / 1024).toFixed(1)} Ko`);

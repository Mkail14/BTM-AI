import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { waterCells } from "../src/lib/water/cells";
import { ISLANDS } from "../src/lib/water/coast";
import { WATER_ZONES } from "../src/lib/water/zones";

/** Point dans un anneau (lng, lat). */
function inside(ring: [number, number][], lng: number, lat: number) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}
const onLand = (lng: number, lat: number) => ISLANDS.some((r) => inside(r, lng, lat));

describe("carte de l'eau : zones par village", () => {
  const points = WATER_ZONES.map((z) => ({ lat: z.lat, lng: z.lng }));
  const cells = waterCells(points);
  const holders = (lng: number, lat: number) => cells.flatMap((c, i) => (c?.some((r) => inside(r, lng, lat)) ? [i] : []));

  it("chaque lieu sur la terre a sa zone, qui le contient", () => {
    const seen = new Set<string>();
    points.forEach((p, i) => {
      const key = `${p.lat},${p.lng}`;
      if (seen.has(key)) return assert.equal(cells[i], null);
      seen.add(key);
      if (!onLand(p.lng, p.lat)) return;
      assert.ok(cells[i]?.some((r) => inside(r, p.lng, p.lat)), `zone manquante : ${WATER_ZONES[i]!.name}`);
    });
  });

  it("un endroit de l'île revient au lieu le plus proche", () => {
    const at = { lat: -12.78, lng: 45.2 };
    const dist = (p: { lat: number; lng: number }) => Math.hypot(p.lat - at.lat, p.lng - at.lng);
    const near = points.reduce((best, p, i) => (dist(p) < dist(points[best]!) ? i : best), 0);
    const h = holders(at.lng, at.lat);
    assert.equal(h.length, 1);
    assert.equal(dist(points[h[0]!]!), dist(points[near]!));
  });

  it("rien n'est coloré en mer ni sur les îlots", () => {
    assert.deepEqual(holders(45.26, -12.82), []); // lagon entre les deux îles
    assert.deepEqual(holders(45.2556, -12.8019), []); // îlot Mbouzi
    assert.deepEqual(holders(45.0296, -12.6463), []); // îlot Mtsamboro
  });
});

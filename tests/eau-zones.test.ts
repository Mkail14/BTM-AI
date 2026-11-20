import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { waterCells } from "../src/lib/water/cells";
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

describe("carte de l'eau : zones par village", () => {
  const points = WATER_ZONES.map((z) => ({ lat: z.lat, lng: z.lng }));
  const cells = waterCells(points);

  it("chaque lieu a sa zone, qui le contient", () => {
    const seen = new Set<string>();
    points.forEach((p, i) => {
      const key = `${p.lat},${p.lng}`;
      if (seen.has(key)) return assert.equal(cells[i], null);
      seen.add(key);
      assert.ok(cells[i], `zone manquante : ${WATER_ZONES[i]!.name}`);
      assert.ok(inside(cells[i]!, p.lng, p.lat));
    });
  });

  it("un endroit revient au lieu le plus proche", () => {
    const at = { lat: -12.78, lng: 45.2 };
    const near = points.reduce((best, p, i) => (Math.hypot(p.lat - at.lat, p.lng - at.lng) < Math.hypot(points[best]!.lat - at.lat, points[best]!.lng - at.lng) ? i : best), 0);
    const holders = cells.flatMap((c, i) => (c && inside(c, at.lng, at.lat) ? [i] : []));
    assert.equal(holders.length, 1);
    const h = points[holders[0]!]!;
    assert.equal(`${h.lat},${h.lng}`, `${points[near]!.lat},${points[near]!.lng}`);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import sharp from "sharp";
import { readWeekGrid, titleDates, type RawImage } from "@/lib/water/grid";
import { tintedColumns, villagesFromLines } from "@/lib/water/villages";
import { findZone } from "@/lib/water/zones";

/**
 * Lecture sans IA du planning de la SMAE du 23/11 au 13/12/2026 (images réduites de moitié :
 * la lecture ne dépend pas de la taille de l'image).
 */
const fixture = (name: string) => new URL(`./fixtures/eau/${name}`, import.meta.url);

async function load(name: string): Promise<RawImage> {
  const { data, info } = await sharp(readFileSync(fixture(name))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: info.channels, data };
}

describe("Tours d'eau : lecture des images de la SMAE sans IA", () => {
  it("prend les dates dans le titre de la page", () => {
    assert.deepEqual(titleDates("Planning des tours d'eau du 23.11.2026 au 13.12.2026"), { from: "2026-11-23", to: "2026-12-13" });
    assert.equal(titleDates("Planning des tours d'eau"), null);
  });

  it("lit les cases de la 1re semaine par leurs couleurs", async () => {
    assert.deepEqual(readWeekGrid(await load("semaine-2026-11-23-1.jpg")), [
      ["fermeture", "ferme", "ouverture", "journee"],
      ["ferme", "ouverture", "fermeture", "journee"],
      ["ouverture", "fermeture", "ferme", "journee"],
      ["fermeture", "ferme", "ouverture", "journee"],
      ["ferme", "ouverture", "fermeture", "journee"],
      ["ouverture", "fermeture", "ferme", "journee"],
      ["fermeture", "ferme", "ouverture", "journee"],
    ]);
  });

  it("lit les cases de la 3e semaine", async () => {
    assert.deepEqual(readWeekGrid(await load("semaine-2026-11-23-3.jpg")), [
      ["ouverture", "fermeture", "ferme", "journee"],
      ["fermeture", "ferme", "ouverture", "journee"],
      ["ferme", "ouverture", "fermeture", "journee"],
      ["ouverture", "fermeture", "ferme", "journee"],
      ["fermeture", "ferme", "ouverture", "journee"],
      ["ferme", "ouverture", "fermeture", "journee"],
      ["ouverture", "fermeture", "ferme", "journee"],
    ]);
  });

  it("reconnaît l'image des villages (pas une semaine) et y trouve 4 colonnes", async () => {
    const image = await load("villages-2026-11-23.jpg");
    assert.equal(readWeekGrid(image), null);
    assert.equal(tintedColumns(image).length, 4);
  });

  it("remet en ordre les lignes lues dans l'image des villages", () => {
    const lines = JSON.parse(readFileSync(fixture("lignes-villages-2026-11-23.json"), "utf8")) as Record<string, { text: string; x: number }[]>;
    const sectors = Object.values(lines).map((col) => villagesFromLines(col, 1754));
    assert.deepEqual(sectors.map((s) => s.length), [33, 30, 33, 2]);
    assert.ok(sectors[0].includes("Convaslescence – Mdz (100 villas, vertivert)"));
    assert.ok(sectors[1].includes("Bandraboua village (sud – Ngambo Titi)"));
    assert.ok(sectors[1].includes("Tsoundzou I"));
    assert.ok(sectors[2].includes("Tsoundzou II"));
    assert.deepEqual(sectors[3], ["Z.I. Kawéni", "Z.I. Vallée 3"]);
    // Tous placés sur la carte.
    assert.deepEqual(sectors.flat().filter((name) => !findZone(name)), []);
  });
});

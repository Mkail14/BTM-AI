import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BUILTIN_CATALOG, mergeCatalog, playableSounds } from "../src/lib/lecture/catalog";
import { scriptPrompt, scriptSchema } from "../src/lib/lecture/prompt";
import { buildLine, buildMeta } from "../src/lib/lecture/script";

/** Sons réglés dans /admin/sons : débranché, ajouté, renommé. */
const catalog = mergeCatalog({
  sons: {
    coq: { active: false },
    pluie: { name: "averse tropicale" },
    pirogue: { kind: "bruit", name: "pirogue qui glisse sur le lagon", file: "fichiers/pirogue-1.mp3", scary: false },
    "sans-fichier": { kind: "bruit", name: "son sans fichier" },
  },
});

const raw = {
  lisible: true,
  titre: "Essai",
  lieu: "plage",
  intro: "",
  fin: "",
  musique: "comedie",
  decor: [
    { son: "pluie", cote: 0, distance: "loin", volume: 0.5, bouge: false },
    { son: "inconnu", cote: 0, distance: "loin", volume: 0.5, bouge: false },
  ],
  personnages: [],
};

describe("sons réglables (/admin/sons)", () => {
  it("un son débranché disparaît de la consigne et du schéma ; un son ajouté y entre", () => {
    const prompt = scriptPrompt("histoire", catalog);
    assert.ok(!/\bcoq \(/.test(prompt));
    assert.ok(prompt.includes("pirogue (pirogue qui glisse sur le lagon)"));
    assert.ok(prompt.includes("pluie (averse tropicale)"));
    const effects = scriptSchema(catalog).properties.repliques.items.properties.bruits.items.properties.son.enum as readonly string[];
    assert.ok(effects.includes("pirogue"));
    assert.ok(!effects.includes("coq"));
    assert.ok(!catalog.some((s) => s.id === "sans-fichier"));
  });

  it("les sons hors catalogue sont écartés, les sons ajoutés gardés", () => {
    const meta = buildMeta(raw, "Kore", catalog);
    assert.ok(meta.ok);
    if (!meta.ok) return;
    assert.deepEqual(
      meta.meta.ambiences.map((a) => a.sound),
      ["pluie"],
    );
    assert.equal(meta.meta.sons?.pirogue?.url?.endsWith("/lecture-sons/fichiers/pirogue-1.mp3"), true);
    assert.equal(meta.meta.sons?.coq, undefined);
    const line = buildLine(
      {
        qui: "narratrice",
        texte: "La pirogue glisse.",
        cote: 0,
        distance: "pres",
        bruits: [
          { son: "pirogue", quand: "pendant", cote: 30 },
          { son: "coq", quand: "avant", cote: 0 },
        ],
      },
      meta.cast,
    );
    assert.deepEqual(
      line?.cues.map((c) => c.sound),
      ["pirogue"],
    );
  });

  it("sans réglage, tous les sons d'origine sont jouables", () => {
    const playable = playableSounds(BUILTIN_CATALOG);
    assert.equal(Object.keys(playable).length, BUILTIN_CATALOG.length);
    assert.equal(playable.coq.url, "/sons/coq.webm");
    assert.equal(playable.pas.url, null);
    assert.equal(playable.tonnerre.scary, true);
    assert.equal(playable.comedie.light, true);
  });
});

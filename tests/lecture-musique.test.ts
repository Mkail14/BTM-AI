import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { LIGHT_MOODS, MOOD_IDS, SCARY_SOUNDS, musicUrl } from "../src/lib/lecture/bank";
import { SCRIPT_SCHEMA, scriptPrompt } from "../src/lib/lecture/prompt";
import { buildScript } from "../src/lib/lecture/script";

const raw = (musique: unknown, lines: Record<string, unknown>[]) => ({
  lisible: true,
  titre: "La nuit du baobab",
  lieu: "plein-air",
  intro: "Mets tes écouteurs.",
  musique,
  decor: [],
  personnages: [],
  repliques: lines.map((l) => ({ qui: "narratrice", texte: "Il était une fois.", cote: 0, ...l })),
});

describe("Lecture en 3D : musique de fond", () => {
  it("garde la musique du début et ses changements en cours d'histoire", () => {
    const result = buildScript(raw("calme", [{}, { musique: "horreur" }, { musique: "silence" }, { musique: null }]), "Leda");
    assert.ok(result.ok);
    assert.equal(result.script.music, "calme");
    assert.deepEqual(
      result.script.lines.map((l) => l.music),
      [null, "horreur", "silence", null],
    );
  });

  it("écarte une ambiance inconnue sans perdre l'histoire", () => {
    const result = buildScript(raw("disco", [{ musique: "jazz" }]), "Leda");
    assert.ok(result.ok);
    assert.equal(result.script.music, null);
    assert.equal(result.script.lines[0].music, null);
  });

  it("demande la musique à Gemini, au début et à chaque réplique", () => {
    assert.ok(SCRIPT_SCHEMA.required.includes("musique"));
    assert.ok(SCRIPT_SCHEMA.properties.repliques.items.required.includes("musique"));
    // La musique arrive avant les répliques : elle se télécharge pendant que Gemini écrit.
    const order: readonly string[] = SCRIPT_SCHEMA.propertyOrdering;
    assert.ok(order.indexOf("musique") < order.indexOf("repliques"));
    const prompt = scriptPrompt("histoire");
    for (const mood of MOOD_IDS) assert.ok(prompt.includes(mood), mood);
  });

  it("chaque ambiance a son fichier, léger pour le débit de Mayotte", () => {
    for (const mood of MOOD_IDS) {
      const file = `public${musicUrl(mood)}`;
      assert.ok(existsSync(file), file);
      assert.ok(statSync(file).size < 200_000, `${file} trop lourd`);
    }
  });

  it("les ambiances légères n'ont pas les bruits qui font peur", () => {
    assert.ok(LIGHT_MOODS.has("comedie") && LIGHT_MOODS.has("vlog"));
    assert.ok(!LIGHT_MOODS.has("horreur") && !LIGHT_MOODS.has("suspense"));
    assert.ok(SCARY_SOUNDS.has("tonnerre"));
  });
});

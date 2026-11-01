import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { harmonyFor } from "../src/lib/ai/harmonize";

describe("harmonisation des modèles", () => {
  it("laisse la référence (Gemini) et les grands modèles tels quels", () => {
    assert.equal(harmonyFor("gemini-3.8-flash"), null);
    assert.equal(harmonyFor("google/gemini-3.5-flash-lite"), null);
    assert.equal(harmonyFor("anthropic/claude-haiku-5.5"), null);
  });

  it("recadre les autres modèles : identité, féminin, personnalité, température basse", () => {
    const harmony = harmonyFor("nvidia/nemotron-3.5-lightning:free");
    assert.ok(harmony);
    assert.match(harmony.reminder, /NVIDIA/);
    assert.match(harmony.reminder, /féminin/);
    assert.match(harmony.reminder, /PERSONNALITÉ/);
    assert.ok(harmony.temperature < 1);
  });
});

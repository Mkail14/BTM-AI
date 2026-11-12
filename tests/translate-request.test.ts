import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isShimaoreTranslationRequest } from "@/lib/language/translate-request";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";

describe("traduction en shimaoré (administrateurs)", () => {
  it("reconnaît la demande", () => {
    assert.equal(isShimaoreTranslationRequest("traduis en shimaoré \"Un mur à monter ?\""), true);
    assert.equal(isShimaoreTranslationRequest("Tu peux traduire ce texte en mahorais ?"), true);
    assert.equal(isShimaoreTranslationRequest("Ecris-moi ça en shimaore"), true);
  });

  it("ignore le reste", () => {
    assert.equal(isShimaoreTranslationRequest("Combien coûte un mur en parpaings ?"), false);
    assert.equal(isShimaoreTranslationRequest("Traduis en anglais : bonjour"), false);
  });

  it("ajoute la consigne seulement quand elle est demandée", () => {
    const withTask = buildSystemPrompt(DEFAULT_PERSONALITY, { shimaoreTranslation: true });
    const without = buildSystemPrompt(DEFAULT_PERSONALITY, {});
    assert.match(withTask, /Je ne sais pas traduire/);
    assert.doesNotMatch(without, /Je ne sais pas traduire/);
  });
});

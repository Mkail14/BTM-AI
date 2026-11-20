import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compositionBlock,
  findValidated,
  parseComposition,
  phraseToTranslate,
  unsureWords,
} from "@/lib/language/compose";

describe("seul un administrateur apprend le shimaoré à Tamilya", () => {
  // Essai du 2026-11-16 avec un compte ordinaire : « J'ai noté… je la garderai pour la prochaine fois ».
  it("avec les autres, elle ne promet pas de retenir", async () => {
    const { buildSystemPrompt, NOT_LEARNED } = await import("@/lib/ai/system-prompt");
    const { DEFAULT_PERSONALITY } = await import("@/lib/ai/personalities");
    assert.ok(buildSystemPrompt(DEFAULT_PERSONALITY, {}).includes(NOT_LEARNED));
    assert.ok(!buildSystemPrompt(DEFAULT_PERSONALITY, { teachesShimaore: true }).includes(NOT_LEARNED));
    const c = { french: "bonjour", shimaore: "", validated: false, unsure: [], known: [] };
    assert.match(compositionBlock(c, false), /sans promettre de la retenir/);
    assert.match(compositionBlock(c, true), /te l'apprendre/);
  });
});

describe("moteur du shimaoré : « comment on dit … »", () => {
  it("retrouve la phrase à dire", () => {
    assert.equal(phraseToTranslate("Coucou comment on dit j'aime pas aller à la plage"), "j'aime pas aller à la plage");
    assert.equal(phraseToTranslate("Comment dit-on bonjour en shimaoré ?"), "bonjour");
    assert.equal(phraseToTranslate("comment ça se dit « merci » en mahorais"), "merci");
    assert.equal(phraseToTranslate("traduis en shimaoré : je m'appelle Tamilya"), "je m'appelle Tamilya");
  });

  it("laisse le reste", () => {
    assert.equal(phraseToTranslate("Comment on dit bonjour en anglais ?"), null);
    assert.equal(phraseToTranslate("combien de temps pour aller à la plage"), null);
  });

  it("redonne une phrase validée, même écrite autrement", () => {
    const entries = [
      { french: "plage", shimaore: "mutsanga" },
      { french: "je n'aime pas aller à la plage", shimaore: "tsi vedzé ou hedrah la plagi" },
    ];
    assert.equal(findValidated(entries, "j'aime pas aller à la plage")?.shimaore, "tsi vedzé ou hedrah la plagi");
    assert.equal(findValidated(entries, "j'aime la plage"), null);
  });

  // Conversation du 2026-11-16 : « nisi ou hega » présenté comme sûr.
  it("le code décide des mots sûrs, pas le modèle", () => {
    const given = [
      { french: "plage", shimaore: "mutsanga" },
      { french: "aimer", shimaore: "uvendza" },
    ];
    assert.deepEqual(unsureWords("Nisi ou hega mutsanga", given), ["Nisi", "ou", "hega"]);
    assert.deepEqual(unsureWords("moutsanga", given), []);
    // Les noms de la phrase française ne sont pas devinés.
    assert.deepEqual(unsureWords("Noh hiriwa Claude noh ketsi Mmamoudzou", [], "je m'appelle Claude et j'habite à Mamoudzou"), ["Noh", "hiriwa", "ketsi"]);
  });

  it("lit la réponse du moteur", () => {
    assert.equal(parseComposition('Voici : {"shimaore":"tsi vedzé  mutsanga","manque":[]}'), "tsi vedzé mutsanga");
    assert.equal(parseComposition('{"shimaore":"","manque":["aller"]}'), "");
    assert.equal(parseComposition("je ne sais pas"), null);
  });

  it("dit à Tamilya quoi faire selon ce qui est sûr", () => {
    const base = { french: "j'aime pas aller à la plage", known: [{ french: "plage", shimaore: "mutsanga" }] };
    assert.match(compositionBlock({ ...base, shimaore: "tsi vedzé ou hedrah la plagi", validated: true, unsure: [] }), /avec assurance/);
    assert.match(compositionBlock({ ...base, shimaore: "tsi vedzé mutsanga", validated: false, unsure: [] }), /Proposition du moteur/);
    // Essai du 2026-11-16 : « nisi veli mivo mivo mutsanga » était donné avec « veli » et « mivo » à vérifier.
    const guessed = compositionBlock({ ...base, shimaore: "nisi veli mivo mivo mutsanga", validated: false, unsure: ["veli", "mivo"] });
    assert.doesNotMatch(guessed, /veli/);
    assert.match(guessed, /ne sais pas encore/);
    const unknown = compositionBlock({ ...base, shimaore: "", validated: false, unsure: [] });
    assert.match(unknown, /ne sais pas encore/);
    assert.match(unknown, /plage = mutsanga/);
    // Essai du 2026-11-16 : « la plage » lui faisait citer « là = vale ».
    const noisy = compositionBlock({ ...base, known: [{ french: "là", shimaore: "vale" }, ...base.known], shimaore: "", validated: false, unsure: [] });
    assert.doesNotMatch(noisy, /vale/);
  });
});

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
    assert.equal(isShimaoreTranslationRequest("comment on dt tu connais Mamoudzou en shimaoré ?"), true);
    assert.equal(isShimaoreTranslationRequest("Comment dit-on bonjour en shimaoré ?"), true);
    assert.equal(isShimaoreTranslationRequest("comment se dit « merci » en mahorais"), true);
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

describe("leçons relevées dans la conversation", () => {
  it("écarte ce que le locuteur n'a pas dit et les explications en français", async () => {
    const { isGivenBySpeaker, isExplanation } = await import("@/lib/language/teaching");
    assert.equal(isGivenBySpeaker("marahaba", "non, merci se dit marahaba", null), true);
    assert.equal(isGivenBySpeaker("nyumba", "oui", "maison se dit nyumba, c'est bien ça ?"), true);
    assert.equal(isGivenBySpeaker("tsi dzipvagna", "bonne nuit", null), false);
    assert.equal(isExplanation("non, merci se dit marahaba"), true);
    assert.equal(isExplanation("Wawé jouwa dhago la Mamoudzou ?"), false);
  });

  // Conversation du 2026-11-16 : Tamilya invente « nisi ou hega », le maître la corrige, et c'est l'invention qui est retenue.
  it("ne garde pas la traduction que le locuteur corrige", async () => {
    const { isGivenBySpeaker, isNotAMeaning } = await import("@/lib/language/teaching");
    const reply = "En shimaoré, on dit : Nisi ou hega. Ça veut dire littéralement « je te déteste ». Nisi ou hega wa fatché.";
    assert.equal(isGivenBySpeaker("nisi ou hega", "tsi vedzé watchu baba c'est comme sa on dit", reply), false);
    assert.equal(isGivenBySpeaker("nisi ou hega wa fatché", "tsi vedzé watchu baba c'est comme sa on dit", reply), false);
    assert.equal(isGivenBySpeaker("tsi vedzé watchu baba", "tsi vedzé watchu baba c'est comme sa on dit", reply), true);
    assert.equal(isGivenBySpeaker("ya havih", "non c'est où avec un accent", "D'accord, je retiens : ya havih, il est ou."), true);
    assert.equal(isNotAMeaning("Non, c'est ça"), true);
    assert.equal(isNotAMeaning("littéralement je te déteste"), true);
    assert.equal(isNotAMeaning("je n'aime pas les gommes"), false);
    assert.equal(isNotAMeaning("oui"), false);
  });

  // Conversation du 2026-11-16 : « non c'est tsi vedzé ou hedrah la pjagi » n'avait aucun mot-clé, rien n'était relevé.
  it("relève la correction d'une phrase demandée juste avant", async () => {
    const { mayBeTeaching } = await import("@/lib/language/teaching");
    const ask = "Coucou comment on dit j'aime pas aller à la plage";
    assert.equal(mayBeTeaching("non c'est tsi vedzé ou hedrah la pjagi", "Nisi ou hega mutsanga.", ask), true);
    assert.equal(mayBeTeaching("merci, à demain", "Avec plaisir !", "tu fais quoi ce soir ?"), false);
  });

  it("« comment on dit … aller à la plage » n'ouvre pas de trajet", async () => {
    const { detectTrip } = await import("@/lib/trip/intent");
    assert.equal(detectTrip("Coucou comment on dit j'aime pas aller à la plage"), null);
    assert.notEqual(detectTrip("combien de temps pour aller à la plage de Moya"), null);
  });

  it("une phrase à traduire ne va pas dans la mémoire de la personne", async () => {
    const { shouldLearnFrom } = await import("@/lib/ai/memory");
    assert.equal(shouldLearnFrom("comment on dit j'aime pas les Hommes"), false);
    assert.equal(shouldLearnFrom("comment ça se dit je suis fatigué en shimaoré"), false);
    assert.equal(shouldLearnFrom("j'ai deux enfants, Inaya et Soufiane"), true);
    // Essai du 2026-11-16 : la correction d'une traduction finissait en souvenir (« A signalé que la forme correcte est … »).
    assert.equal(shouldLearnFrom("non c'est tsi vedzé ou hedrah la plagi", "comment on dit j'aime pas aller à la plage"), false);
    assert.equal(shouldLearnFrom("non j'habite à Sada", "tu habites où ?"), true);
    const { extractMemories } = await import("@/lib/ai/memory");
    assert.deepEqual(extractMemories("comment on dit je m'appelle Claude et j'habite à Mamoudzou"), []);
    assert.ok(extractMemories("je m'appelle Inaya").length > 0);
  });
});

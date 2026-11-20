import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { keepRealDoubts, parseDoubts } from "@/lib/language/doubts";
import { acceptReview } from "@/lib/language/review";

describe("acceptReview", () => {
  const draft = "Kwezi ! Ninafanya kazi leo.";
  it("garde le brouillon quand le relecteur dit OK", () => {
    assert.equal(acceptReview(draft, "OK"), draft);
    assert.equal(acceptReview(draft, " ok. "), draft);
  });
  it("prend la version relue", () => {
    assert.equal(acceptReview(draft, "Kwezi ! Nifanya kazi leo."), "Kwezi ! Nifanya kazi leo.");
  });
  it("refuse une version vide ou trop différente", () => {
    assert.equal(acceptReview(draft, ""), draft);
    assert.equal(acceptReview(draft, "Kwezi"), draft);
    assert.equal(acceptReview(draft, draft.repeat(3)), draft);
  });
  it("ne touche jamais aux blocs de code", () => {
    const withBlock = "Kwezi ! Voici :\n```ticket\nA\n```";
    assert.equal(acceptReview(withBlock, "Kwezi ! Voici :\n```ticket\nB\n```"), withBlock);
  });
});

describe("parseDoubts", () => {
  it("lit le tableau JSON, même entouré de texte", () => {
    const out = 'Voici : [{"phrase":"a b","french":"x","question":"Juste ?"}] fin';
    assert.deepEqual(parseDoubts(out), [{ phrase: "a b", french: "x", question: "Juste ?" }]);
  });
  it("ignore le reste", () => {
    assert.deepEqual(parseDoubts("[]"), []);
    assert.deepEqual(parseDoubts("n'importe quoi"), []);
    assert.deepEqual(parseDoubts('[{"phrase":"","question":"q"}]'), []);
  });
  it("garde 2 doutes au plus", () => {
    const three = JSON.stringify([1, 2, 3].map((n) => ({ phrase: `p${n}`, question: "q" })));
    assert.equal(parseDoubts(three).length, 2);
  });
});

describe("keepRealDoubts : on ne redemande pas au maître ce qu'il a validé", () => {
  // Extrait de la vraie base du 2026-11-20.
  const validated = ["Wawé hiriwa m’banni ?", "tsi vedzé gommu", "Tsi vedzé watchu baba", "Kwezi, wa fetché ?", "maji"];
  const ask = (phrase: string, french = "") => ({ phrase, french, question: "Juste ?" });

  it("écarte une phrase validée, même écrite autrement (apostrophe, majuscule, ponctuation)", () => {
    assert.deepEqual(keepRealDoubts([ask("Wawé hiriwa m'banni ?", "Comment tu t'appelles ?")], validated), []);
    assert.deepEqual(keepRealDoubts([ask("Tsi vedzé gommu", "je n'aime pas les hommes")], validated), []);
  });

  it("garde un morceau de phrase validée : il peut cacher une vraie question", () => {
    // « Noh védza » (dans « Noh védza unwa ») : noh ou nisi ? Question de grammaire légitime.
    assert.equal(keepRealDoubts([ask("vedzé watchu")], validated).length, 1);
  });

  it("garde une vraie phrase inventée, même faite de mots connus", () => {
    // « Tsi vedzé maji » : mots connus, mais la phrase n'a jamais été validée.
    assert.equal(keepRealDoubts([ask("Tsi vedzé maji", "je n'aime pas l'eau")], validated).length, 1);
    assert.equal(keepRealDoubts([ask("Tsa fetché nami", "je vais bien aussi")], validated).length, 1);
  });
});

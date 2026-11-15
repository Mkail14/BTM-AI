import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDoubts } from "@/lib/language/doubts";
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

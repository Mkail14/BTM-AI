import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { replacePassage } from "@/lib/language/replace-passage";

describe("replacePassage", () => {
  it("remplace le passage sélectionné malgré retours à la ligne, gras et crochets", () => {
    assert.equal(replacePassage("Kwezi !\n**Wa fetché** ?", "Kwezi ! Wa fetché", "Kwezi, wa fetché"), "Kwezi, wa fetché ?");
    assert.equal(replacePassage("Ni [[marché]] lewo", "marché", "bazari"), "Ni bazari lewo");
  });

  it("ignore les majuscules et laisse le texte intact si le passage n'y est pas", () => {
    assert.equal(replacePassage("KWEZI mama", "kwezi", "jéjé"), "jéjé mama");
    assert.equal(replacePassage("Kwezi mama", "marahaba", "x"), "Kwezi mama");
    assert.equal(replacePassage("Kwezi", "  ", "x"), "Kwezi");
  });
});

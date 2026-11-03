import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLexiconTree } from "@/lib/language/curriculum";
import { parseSuggestion } from "@/lib/language/branches";

describe("branches proposées par Tamilya", () => {
  it("lit la proposition, même entourée de texte, sans les mots déjà connus", () => {
    const out = 'Voici : ```json\n{"label":"marché","emoji":"🧺","reason":"On me parle du marché.","words":["Banane","prix","combien","Banane","bonjour"]}\n```';
    const s = parseSuggestion(out, new Set(["bonjour"]));
    assert.deepEqual(s, { label: "Marché", emoji: "🧺", reason: "On me parle du marché.", words: ["banane", "prix", "combien"] });
    assert.equal(parseSuggestion("pas de json", new Set()), null);
  });

  it("ajoute la branche à la carte, ses mots appris ou à apprendre", () => {
    const tree = buildLexiconTree(
      [{ id: "1", french: "prix", shimaore: "bei", category: "Marché" }],
      [{ id: "b1", label: "Marché", emoji: "🧺", hue: 90, reason: "", words: ["prix", "combien"] }],
    );
    const branch = tree.children?.find((c) => c.id === "branche-b1");
    assert.equal(branch?.emoji, "🧺");
    assert.equal(branch?.learned, 1);
    assert.equal(branch?.total, 2);
    assert.equal(tree.children?.some((c) => c.id === "ranger"), false);
  });
});

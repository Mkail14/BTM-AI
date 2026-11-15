import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectWords } from "@/lib/ai/words";
import { ALL_GROUP_CATEGORIES } from "@/lib/language/curriculum";

// Les valeurs shimaoré sont fictives : le test ne vérifie que l'ordre de choix des mots.
describe("vocabulaire donné à Tamilya quand elle parle shimaoré", () => {
  it("les mots qui construisent une phrase passent avant les imports récents", () => {
    const entries = [
      { french: "pronom", shimaore: "aaa", category: "mot outil" },
      { french: "question", shimaore: "bbb", category: "Questions & liens › Négation" },
      // Import en vrac plus récent : rangé après (entries va du plus ancien au plus récent).
      ...Array.from({ length: 10 }, (_, i) => ({ french: `objet ${i}`, shimaore: `zzz${i}`, category: "objet" })),
    ];
    const picked = selectWords(entries, "parle shimaoré", { topic: true, maxTopic: 3 });
    assert.deepEqual(
      picked.map((w) => w.french).slice(0, 2).sort(),
      ["pronom", "question"],
    );
  });

  it("le programme range les petits mots dans des catégories assez courtes pour la base", () => {
    for (const category of ALL_GROUP_CATEGORIES) assert.ok(category.length <= 40, category);
    assert.ok(ALL_GROUP_CATEGORIES.includes("Questions & liens › Négation"));
    assert.ok(ALL_GROUP_CATEGORIES.includes("Phrases utiles › Phrases de base"));
  });
});

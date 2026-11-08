import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { splitStableMarkdown } from "@/lib/chat/markdown-split";

const sample = [
  "Bonjour ! Voici **quelques idées**.",
  "## Les étapes",
  "1. S'inscrire\n2. Réviser",
  "Texte",
  "- a\n\n- b\n\n  suite de b",
  "Après la liste",
  "| a | b |\n|---|---|\n| 1 | 2 |",
  "Fin",
].join("\n\n");

describe("découpe du Markdown pendant l'écriture", () => {
  it("ne perd ni n'ajoute aucun caractère, à chaque lettre", () => {
    for (let k = 0; k <= sample.length; k++) {
      const text = sample.slice(0, k);
      const { head, tail } = splitStableMarkdown(text);
      assert.equal(head + tail, text);
      if (head) assert.ok(head.endsWith("\n\n"), "le début se termine par une ligne vide");
    }
  });

  it("coupe avant un nouveau paragraphe ou titre", () => {
    assert.deepEqual(splitStableMarkdown("Un.\n\nDeux.\n\n## Trois"), { head: "Un.\n\nDeux.\n\n", tail: "## Trois" });
  });

  it("ne coupe pas une liste aérée, un retrait ni un tableau", () => {
    assert.equal(splitStableMarkdown("- a\n\n- b").head, "");
    assert.equal(splitStableMarkdown("1. a\n\n2. b").head, "");
    assert.equal(splitStableMarkdown("- a\n\n  suite").head, "");
    assert.equal(splitStableMarkdown("| a |\n|---|\n\n| b |").head, "");
  });

  it("ne coupe jamais après un bloc ``` (les cartes restent en place)", () => {
    const text = "Voici :\n\n```creneaux-code\nKaweni\n\njour: 2026\n```\n\nBonne chance\n\nÀ bientôt";
    assert.deepEqual(splitStableMarkdown(text), { head: "Voici :\n\n", tail: text.slice("Voici :\n\n".length) });
  });

  it("garde tout ensemble avec des notes, des liens définis plus loin ou du HTML", () => {
    for (const text of ["Texte[^1]\n\nSuite\n\n[^1]: note", "Voir [x][r]\n\nSuite\n\n[r]: https://x.fr", "Avant\n\n<div>\n\nApres"]) {
      assert.deepEqual(splitStableMarkdown(text), { head: "", tail: text });
    }
  });
});

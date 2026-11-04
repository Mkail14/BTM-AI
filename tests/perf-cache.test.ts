import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { glossMessage, selectWords } from "@/lib/ai/words";
import { mergeMemories } from "@/lib/chat/memories";
import { fillKnownWords, translationTable } from "@/lib/language/unknown-words";

const VOCAB = [
  { french: "bonjour", shimaore: "jéjé" },
  { french: "merci", shimaore: "marahaba" },
  { french: "merci beaucoup", shimaore: "marahaba mana" },
  { french: "maison", shimaore: "nyumba" },
];

describe("vocabulaire préparé une fois", () => {
  it("donne le même résultat au deuxième appel (préparation gardée)", () => {
    const first = selectWords(VOCAB, "les maisons et le marahabaa");
    const second = selectWords(VOCAB, "les maisons et le marahabaa");
    assert.deepEqual(second, first);
    assert.deepEqual(first.map((w) => w.french).sort(), ["maison", "merci"]);
    assert.deepEqual(glossMessage(VOCAB, "djéjé, marahaba mana !"), glossMessage(VOCAB, "djéjé, marahaba mana !"));
  });

  it("refait la préparation si le tableau a changé de taille", () => {
    const words = [...VOCAB];
    assert.equal(selectWords(words, "ma nyumba").length, 1);
    words.push({ french: "enfant", shimaore: "mwana" });
    assert.deepEqual(selectWords(words, "ma nyumba na mwana").map((w) => w.french), ["maison", "enfant"]);
  });

  it("tolère une ou deux lettres d'écart selon la longueur, comme sameShimaoreWord", () => {
    const words = [{ french: "remerciement", shimaore: "marahabaniii" }];
    assert.equal(selectWords(words, "marahabaniii").length, 1);
    assert.equal(selectWords([{ french: "x", shimaore: "nyumbani" }], "nyumbanu").length, 1);
    assert.equal(selectWords([{ french: "x", shimaore: "mwana" }], "mwezi").length, 0);
  });
});

describe("table des traductions préparée une fois", () => {
  it("remplace pareil à chaque appel", () => {
    const table = translationTable([
      { french: "marché", shimaore: "bazari" },
      { french: "le taxi coûte 3 €", shimaore: "taxi ya 3 €" },
    ]);
    const text = "Ngamwenda [[marché]], [[De Trévani, le taxi coûte 3 €]].";
    const first = fillKnownWords(text, table);
    assert.equal(fillKnownWords(text, table), first);
    // L'article est retiré de la clé apprise : « le » reste à traduire (comme avant le précalcul).
    assert.equal(first, "Ngamwenda bazari, [[De Trévani, le]] taxi ya 3 €.");
  });
});

describe("mémoire du message", () => {
  it("met les faits du message en premier et remplace ceux de même sorte", () => {
    const merged = mergeMemories(
      [{ kind: "prenom", content: "Prénom : Ali" }],
      [
        { kind: "lieu", content: "Habite à : Koungou" },
        { kind: "prenom", content: "Prénom : Mario" },
      ],
    );
    assert.deepEqual(merged, [
      { kind: "prenom", content: "Prénom : Ali" },
      { kind: "lieu", content: "Habite à : Koungou" },
    ]);
  });

  it("garde la mémoire lue quand le message ne dit rien", () => {
    const stored = [{ kind: "lieu", content: "Habite à : Koungou" }];
    assert.deepEqual(mergeMemories([], stored), stored);
  });
});

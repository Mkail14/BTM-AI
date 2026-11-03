import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { glossMessage, selectWords } from "@/lib/ai/words";
import { sameShimaoreWord, shimaoreKey } from "@/lib/language/shimaore-match";
import { fillKnownWords, translationTable } from "@/lib/language/unknown-words";

const VOCAB = [
  { french: "bonjour", shimaore: "jéjé" },
  { french: "merci", shimaore: "marahaba" },
  { french: "merci beaucoup", shimaore: "marahaba mana" },
  { french: "maison", shimaore: "nyumba" },
  { french: "enfant", shimaore: "mwana" },
  { french: "manger", shimaore: "oula" },
  { french: "marché", shimaore: "bazari" },
];

describe("écritures du shimaoré", () => {
  it("reconnaît les variantes d'un même mot", () => {
    assert.ok(sameShimaoreWord("djéjé", "jéjé"));
    assert.ok(sameShimaoreWord("JEJE", "jéjé"));
    assert.ok(sameShimaoreWord("marahabaa", "marahaba"));
    assert.ok(sameShimaoreWord("marahba", "marahaba"));
    assert.ok(sameShimaoreWord("ula", "oula"));
    assert.equal(shimaoreKey("shiwanda"), shimaoreKey("chiwanda"));
  });

  it("ne confond pas deux mots courts différents", () => {
    assert.equal(sameShimaoreWord("mwana", "mwezi"), false);
    assert.equal(sameShimaoreWord("oula", "ola"), false);
  });
});

describe("lecture du message mot à mot", () => {
  it("donne le sens des mots shimaoré, même mal écrits", () => {
    const { known, unknown } = glossMessage(VOCAB, "djéjé, marahaba mana !");
    assert.deepEqual(
      known.map((k) => [k.written, k.french]),
      [
        ["marahaba mana", "merci beaucoup"],
        ["djéjé", "bonjour"],
      ],
    );
    assert.deepEqual(unknown, []);
  });

  it("liste les mots shimaoré inconnus", () => {
    const { known, unknown } = glossMessage(VOCAB, "jéjé, wami ngamtsaha bazari");
    assert.deepEqual(known.map((k) => k.french).sort(), ["bonjour", "marché"]);
    assert.deepEqual(unknown, ["wami", "ngamtsaha"]);
  });

  it("ne voit pas de mots inconnus dans un message en français", () => {
    assert.deepEqual(glossMessage(VOCAB, "comment on dit maison en shimaoré ?").unknown, []);
  });
});

describe("vocabulaire donné à Tamilya", () => {
  it("trouve les mots du message, en français ou en shimaoré mal écrit", () => {
    const picked = selectWords(VOCAB, "les maisons et le marahabaa").map((w) => w.french);
    assert.deepEqual(picked.sort(), ["maison", "merci"]);
  });

  it("complète avec les mots les plus récents d'abord", () => {
    const picked = selectWords(VOCAB, "parle-moi", { topic: true, maxTopic: 2 }).map((w) => w.french);
    assert.deepEqual(picked, ["marché", "manger"]);
  });
});

describe("mots à apprendre remplacés par le shimaoré appris", () => {
  const table = translationTable(VOCAB);
  it("même avec un article, une majuscule ou au pluriel", () => {
    assert.equal(fillKnownWords("Ndjo [[le marché]] !", table), "Ndjo bazari !");
    assert.equal(fillKnownWords("[[Maisons]]", table), "nyumba");
    assert.equal(fillKnownWords("[[marche]]", table), "bazari");
    assert.equal(fillKnownWords("[[voiture]]", table), "[[voiture]]");
  });
});

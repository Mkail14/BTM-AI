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

  // Phrases réellement corrigées par le maître, puis redites autrement par Tamilya.
  const taught = translationTable([
    { french: "Voici les tacos disponibles près de chez toi", shimaore: "Galiya au tacos zi liyo karibou na haho" },
    { french: "De Trévani jusqu'à Mamoudzou", shimaore: "Trévani taa Mamoudzou" },
    { french: "pôle emploi", shimaore: "France Travail" },
    { french: "merci", shimaore: "marahaba" },
  ]);

  it("une phrase apprise redite avec un mot en plus", () => {
    assert.equal(fillKnownWords("[[Voici les meilleurs tacos disponibles près de chez toi]] !", taught), "Galiya au tacos zi liyo karibou na haho !");
    assert.equal(fillKnownWords("[[Voici les délicieux tacos disponibles près de chez toi]]", taught), "Galiya au tacos zi liyo karibou na haho");
  });

  it("un morceau appris au milieu d'une phrase plus longue", () => {
    assert.equal(
      fillKnownWords("[[De Trévani jusqu'à Mamoudzou, le taxi coûte 3 €]]", taught),
      "Trévani taa Mamoudzou, [[le taxi coûte 3 €]]",
    );
    assert.equal(fillKnownWords("[[Va au pôle emploi]]", taught), "[[Va au]] France Travail");
  });

  it("une phrase trop différente reste à apprendre", () => {
    assert.equal(fillKnownWords("[[Voici les pizzas]]", taught), "[[Voici les pizzas]]");
    // Un mot seul ne remplace pas un bout de phrase.
    assert.equal(fillKnownWords("[[merci pour tout]]", taught), "[[merci pour tout]]");
  });
});

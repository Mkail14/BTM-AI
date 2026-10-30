import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { createUnknownTagFilter, keepReportableWords, mayContainShimaore, parseSpottedWords } from "@/lib/language/unknown-tag";

/** Envoie la réponse morceau par morceau, comme le flux du modèle. */
function stream(chunks: string[]) {
  const filter = createUnknownTagFilter();
  const shown = chunks.map((c) => filter.push(c)).join("");
  const { rest, words } = filter.end();
  return { shown: shown + rest, words };
}

describe("createUnknownTagFilter", () => {
  it("retire la balise, même coupée entre plusieurs morceaux", () => {
    const result = stream(["Je ne connais pas ce mot, je demande à l'équipe.\n<", "<inco", "nnu: mbwa | ", "ntsohi>>"]);
    assert.equal(result.shown, "Je ne connais pas ce mot, je demande à l'équipe.\n");
    assert.deepEqual(result.words, ["mbwa", "ntsohi"]);
  });

  it("laisse passer les « < » qui ne sont pas la balise", () => {
    const result = stream(["Si x <", " 3 et a << b, ", "c'est bon <3"]);
    assert.equal(result.shown, "Si x < 3 et a << b, c'est bon <3");
    assert.deepEqual(result.words, []);
  });

  it("garde un texte sans balise intact", () => {
    assert.deepEqual(stream(["Kwezi ! ", "Ça va ?"]), { shown: "Kwezi ! Ça va ?", words: [] });
  });
});

describe("keepReportableWords", () => {
  it("ne garde que les mots écrits par l'utilisateur et encore inconnus", () => {
    const known = ["Kwezi", "Kwezi wa fetché ?", "marahaba"];
    assert.deepEqual(
      keepReportableWords(["mbwa", "inventé", "kwezi", "wa fetché", "Marahaba"], "Kwezi ! Wa fetché ? Mbwa wangu, marahaba", known),
      ["mbwa"],
    );
  });
});

describe("relevé de fond du shimaoré", () => {
  it("ne se déclenche que si le message semble contenir du shimaoré", () => {
    const known = ["Kwezi wa fetché ?", "marahaba"];
    assert.equal(mayContainShimaore("Kwezi ! mbwa wangu", known), true);
    assert.equal(mayContainShimaore("Tu parles shimaoré ?", known), true);
    assert.equal(mayContainShimaore("Salut, c'est quoi une SCI ?", known), false);
  });

  it("lit le tableau renvoyé par le modèle, même entouré de texte", () => {
    assert.deepEqual(parseSpottedWords('Voici : ["mbwa", "wangu", "mbwa", 3]'), ["mbwa", "wangu"]);
    assert.deepEqual(parseSpottedWords("aucun"), []);
  });
});

describe("signalement des mots inconnus dans le message système", () => {
  it("est demandé aux utilisateurs, pas au maître", () => {
    assert.match(buildSystemPrompt("cool", { reportUnknownWords: true }), /<<inconnu:/);
    assert.doesNotMatch(buildSystemPrompt("cool", { reportUnknownWords: true, teacher: true }), /<<inconnu:/);
    assert.doesNotMatch(buildSystemPrompt(), /<<inconnu:/);
  });
});

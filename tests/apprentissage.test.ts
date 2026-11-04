import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { editDistance, findIssues, type LexEntry } from "@/lib/language/cleanup";
import { measureReply, stillToLearn, weekOf, weeklyProgress } from "@/lib/language/progress";
import { translationTable } from "@/lib/language/unknown-words";

describe("progrès en shimaoré", () => {
  it("semaine commençant le lundi, heure de Mayotte", () => {
    assert.equal(weekOf("2026-11-04T06:00:00Z"), "2026-11-02"); // mercredi
    assert.equal(weekOf("2026-11-01T22:00:00Z"), "2026-11-02"); // lundi 1 h à Mayotte
    assert.equal(weekOf("2026-11-01T20:00:00Z"), "2026-10-26"); // dimanche 23 h à Mayotte
  });

  it("mesure la part restée en français, sans les blocs de code", () => {
    assert.deepEqual(measureReply("Kwezi [[ami]]"), { french: 3, total: 8 });
    assert.deepEqual(measureReply("Kwezi\n```creneaux\nlundi mardi\n```"), { french: 0, total: 5 });
  });

  it("résume chaque semaine", () => {
    const weeks = weeklyProgress([
      { content: "Kwezi !", createdAt: "2026-11-03T08:00:00Z" },
      { content: "[[Bonjour]]", createdAt: "2026-11-04T08:00:00Z" },
      { content: "[[Salut]]", createdAt: "2026-10-27T08:00:00Z" },
    ]);
    assert.deepEqual(weeks, [
      { week: "2026-10-26", replies: 1, fullyShimaore: 0, frenchShare: 100 },
      { week: "2026-11-02", replies: 2, fullyShimaore: 50, frenchShare: 58 },
    ]);
  });

  it("liste ce qui reste à apprendre, sans ce qui est déjà appris", () => {
    const known = translationTable([{ french: "marché", shimaore: "bazari" }]);
    const replies = [
      { content: "Ndjo [[le marché]] [[Petite-Terre]]", createdAt: "2026-11-03T08:00:00Z" },
      { content: "[[Petite-Terre]], [[bus]]", createdAt: "2026-11-04T08:00:00Z" },
    ];
    assert.deepEqual(stillToLearn(replies, known), [
      { french: "Petite-Terre", count: 2 },
      { french: "bus", count: 1 },
    ]);
  });
});

describe("nettoyage du lexique", () => {
  const entry = (id: string, french: string, shimaore: string, table: LexEntry["table"] = "words"): LexEntry => ({ table, id, french, shimaore });

  it("distance entre deux mots", () => {
    assert.equal(editDistance("aeroport", "aeroprt"), 1);
    assert.equal(editDistance("chat", "chat"), 0);
  });

  it("repère espaces, doublons, deux traductions et fautes de frappe", () => {
    const issues = findIssues([
      entry("1", "pôle emploi", "France  Travail"),
      entry("2", "aéroport", "aéroprt"),
      entry("3", "bonjour", "kwezi"),
      entry("4", "Bonjour", "jéjé", "lexicon"),
      entry("5", "merci", "marahaba"),
      entry("6", "merci", "Marahaba", "lexicon"),
      entry("7", "bus", "bus"),
    ]);
    assert.deepEqual(
      issues.map((i) => [i.kind, i.entries.map((e) => e.id).join("+")]),
      [
        ["espaces", "1"],
        ["deux-traductions", "3+4"],
        ["doublon", "5+6"],
        ["copie", "2"],
      ],
    );
  });

  it("n'affiche plus une remarque marquée « c'est voulu »", () => {
    assert.deepEqual(findIssues([entry("2", "aéroport", "aéroprt")], new Set(["copie|words:2"])), []);
  });
});

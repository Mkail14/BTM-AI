import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { editDistance, findIssues, type LexEntry } from "@/lib/language/cleanup";

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

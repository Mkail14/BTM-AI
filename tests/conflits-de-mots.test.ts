import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildLexiconTree, type MapNode } from "@/lib/language/curriculum";
import { conflictsInExchange, findConflicts, hasConflictingEntries } from "@/lib/language/word-conflicts";

const dictionary = [
  { french: "jeudi", shimaore: "yahoa" },
  { french: "Jeudi", shimaore: "alhamisi" },
  { french: "genou", shimaore: "dondro" },
  { french: "genou", shimaore: "gunguni" },
  { french: "et", shimaore: "na" },
  { french: "et", shimaore: "tsena" },
  { french: "maison", shimaore: "nyumba" },
  { french: "maison", shimaore: "Nyumba" },
];

describe("conflits de mots", () => {
  it("un mot français à deux traductions est un conflit, pas une différence de majuscules", () => {
    const conflicts = findConflicts(dictionary);
    assert.deepEqual(
      conflicts.map((c) => c.french),
      ["jeudi", "genou", "et"],
    );
    assert.deepEqual(conflicts[0].translations, ["alhamisi", "yahoa"]);
  });

  it("le conflit compte quand une traduction est écrite dans l'échange", () => {
    const conflicts = findConflicts(dictionary);
    const used = conflictsInExchange(conflicts, { message: "Tu viens yahoa ?", reply: "Oui, jeudi." });
    assert.deepEqual(
      used.map((c) => c.french),
      ["jeudi"],
    );
  });

  it("un mot français ne compte que si on demande du shimaoré, et « na » ne compte jamais", () => {
    const conflicts = findConflicts(dictionary);
    assert.equal(conflictsInExchange(conflicts, { message: "J'ai mal au genou et au dos", reply: "Repose-toi." }).length, 0);
    assert.deepEqual(
      conflictsInExchange(conflicts, { message: "Comment on dit genou en shimaoré ?", reply: "On dit na." }).map((c) => c.french),
      ["genou"],
    );
  });

  it("repère deux traductions dans la liste donnée à Tamilya", () => {
    assert.equal(hasConflictingEntries(dictionary.slice(2, 4)), true);
    assert.equal(hasConflictingEntries(dictionary.slice(6)), false);
  });
});

describe("carte du lexique et conflits", () => {
  const leaves = (node: MapNode): MapNode[] => (node.children?.length ? node.children.flatMap(leaves) : [node]);

  it("un mot à deux traductions donne une seule bulle, qui montre les deux", () => {
    const tree = buildLexiconTree([
      { id: "1", french: "genou", shimaore: "dondro", category: "corps" },
      { id: "2", french: "genou", shimaore: "gunguni", category: "corps" },
    ]);
    const genou = leaves(tree).filter((n) => n.word?.french === "genou" && n.word.shimaore);
    assert.equal(genou.length, 1);
    assert.deepEqual(genou[0].word?.translations, ["dondro", "gunguni"]);
  });

  it("un mot hors programme en conflit n'est pas non plus en double", () => {
    const tree = buildLexiconTree([
      { id: "1", french: "lamantin", shimaore: "lambwara", category: "animal" },
      { id: "2", french: "lamantin", shimaore: "nguva", category: "animal" },
    ]);
    assert.equal(leaves(tree).filter((n) => n.word?.french === "lamantin").length, 1);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSmallTalk } from "../src/lib/ai/small-talk";

describe("Petits messages de politesse (pas de recherche)", () => {
  it("reconnaît bonjour, merci, ça va, au revoir, en français et en shimaoré", () => {
    for (const message of ["Bonjour", "salut ça va ?", "Coucou Tamilya !", "merci beaucoup", "Ok merci", "ça va et toi ?", "Kwezi", "Marahaba !", "bonne nuit", "à plus", "slt cv", "d'accord"]) {
      assert.equal(isSmallTalk(message), true, message);
    }
  });

  it("garde la recherche dès qu'il y a une vraie question", () => {
    for (const message of ["Bonjour, quel temps demain à Mamoudzou ?", "ça va coûter combien ?", "merci, et la barge part à quelle heure ?", "salut tu connais un snack ouvert ?", "", "   "]) {
      assert.equal(isSmallTalk(message), false, message);
    }
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { needsWebSearch } from "../src/lib/ai/web-intent";

describe("Demande d'information : recherche avant la réponse", () => {
  it("cherche pour un fait qui peut changer", () => {
    for (const message of [
      "Qui est l'actuel président du gouvernement de la Nouvelle-Calédonie et depuis quand ?",
      "Quel est le prix du billet Dzaoudzi Paris en ce moment ?",
      "qui a gagné le dernier match du PSG",
      "Combien d'habitants à Mayotte ?",
      "C'est quoi la nouvelle loi sur l'immigration ?",
      "Quand sort le prochain film de Marvel ?",
      "Qui est le maire de Mamoudzou ?",
    ]) {
      assert.equal(needsWebSearch(message), true, message);
    }
  });

  it("ne cherche pas pour une conversation, un conseil ou une demande d'écriture", () => {
    for (const message of [
      "salut ça va ?",
      "merci beaucoup",
      "Comment je fais pour réparer mon wifi ?",
      "Écris-moi une lettre de motivation",
      "Tu préfères le bleu ou le rouge ?",
      "J'ai faim",
      "Explique-moi la photosynthèse",
      "Raconte-moi une blague",
    ]) {
      assert.equal(needsWebSearch(message), false, message);
    }
  });
});

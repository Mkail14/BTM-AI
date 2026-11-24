import assert from "node:assert/strict";
import { test } from "node:test";
import { triedShimaore } from "../src/lib/language/tried-shimaore";

test("réponse tout en français : pas de boutons", () => {
  assert.equal(triedShimaore("Bonjour ! Je peux vous aider à trouver un restaurant ouvert ce soir à Mamoudzou."), false);
  assert.equal(triedShimaore("La barge part toutes les trente minutes depuis Dzaoudzi, le premier départ est à 5 h."), false);
  assert.equal(triedShimaore("Oui !"), false);
});

test("réponse en shimaoré : boutons", () => {
  assert.equal(triedShimaore("Jéjé ! Wami ndzaho Tamilya."), true);
  assert.equal(triedShimaore("Marahaba, kwezi wa fetché ?"), true);
  assert.equal(triedShimaore("Nyumba yangu ya Mamoudzou."), true);
});

test("mot pas sûr en italique ou français laissé entre [[ ]] : elle a essayé", () => {
  assert.equal(triedShimaore("Je suis *mlozi* aujourd'hui."), true);
  assert.equal(triedShimaore("Wami [[je suis contente]]."), true);
});

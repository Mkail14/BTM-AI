import assert from "node:assert/strict";
import { test } from "node:test";
import { isFingerOnly, pickControl } from "../src/lib/voice-live/board";
import { allPartsDone } from "../src/lib/voice-live/stage";

const labels = (...names: string[]) => names.map((label) => ({ label }));

test("payer et réserver restent au doigt", () => {
  for (const label of ["Payer · 2 tickets 3,00 €", "Payer 12,50 € · livré demain à 12 h", "Réserver cette place", "Paiement…", "Valider", "Confirmer", "Recharger mon portefeuille"]) {
    assert.equal(isFingerOnly(label), true, label);
  }
});

test("les étapes ordinaires restent possibles à la voix", () => {
  for (const label of ["Demain", "Ajouter un ticket Piéton", "+ Ajouter une personne", "1 Mamoudzou 3 horaires", "Ajouter Salade paysanne", "Retour"]) {
    assert.equal(isFingerOnly(label), false, label);
  }
});

test("le libellé exact passe avant une ressemblance", () => {
  const picked = pickControl(labels("Mamoudzou", "Mtsapéré-Mamoudzou"), "mamoudzou");
  assert.deepEqual(picked, { found: { label: "Mamoudzou" } });
});

test("un seul libellé proche suffit, accents et casse ignorés", () => {
  const picked = pickControl(labels("1 Kawéni 3 horaires", "2 Sada 1 horaire"), "kaweni");
  assert.deepEqual(picked, { found: { label: "1 Kawéni 3 horaires" } });
});

test("plusieurs possibles : Tamilya ne devine pas", () => {
  const picked = pickControl(labels("1 Mamoudzou 3 horaires", "2 Mtsapéré-Mamoudzou 2 horaires"), "Mamoudzou");
  assert.ok("choices" in picked);
  assert.equal(picked.choices.length, 2);
});

test("rien de reconnu ou demande vide : aucun bouton touché", () => {
  assert.deepEqual(pickControl(labels("Demain"), "Mardi"), { choices: [] });
  assert.deepEqual(pickControl(labels("Demain"), "  "), { choices: [] });
});

test("« ajoute un tacos kebab » trouve le bouton « Ajouter Tacos kebab »", () => {
  const menu = labels("Ajouter Tacos kebab", "Ajouter Tacos poulet");
  for (const wanted of ["Ajouter un tacos kebab", "ajoute le tacos kebab", "tacos kebab"]) {
    assert.deepEqual(pickControl(menu, wanted), { found: { label: "Ajouter Tacos kebab" } }, wanted);
  }
});

test("mêmes mots sur deux boutons : Tamilya ne devine toujours pas", () => {
  const picked = pickControl(labels("Ajouter Tacos kebab", "Ajouter Tacos kebab maxi"), "ajoute un tacos");
  assert.equal("choices" in picked && picked.choices.length, 2);
});

test("tableau combiné : il revient seulement quand toutes ses parties sont finies", () => {
  assert.equal(allPartsDone(2, 1), false);
  assert.equal(allPartsDone(2, 2), true);
});

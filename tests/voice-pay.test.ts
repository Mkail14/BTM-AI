import assert from "node:assert/strict";
import { test } from "node:test";
import { combinedBlock, parseCombined } from "../src/lib/voice-live/combined";
import { hashPin, isAcceptablePin } from "../src/lib/wallet/pin";
import { liveToolBlock } from "../src/lib/voice-live/tools";

test("codes trop simples refusés", () => {
  for (const pin of ["1111", "0000", "1234", "4321", "6789", "123", "12a4", "12345"]) assert.equal(isAcceptablePin(pin), false, pin);
  for (const pin of ["4821", "1357", "9024"]) assert.equal(isAcceptablePin(pin), true, pin);
});

test("le code n'est gardé que sous forme d'empreinte", () => {
  const hash = hashPin("4821", "sel-de-test-0001");
  assert.ok(!hash.includes("4821"));
  assert.equal(hash, hashPin("4821", "sel-de-test-0001"));
  assert.notEqual(hash, hashPin("4821", "autre-sel-00002"));
  assert.notEqual(hash, hashPin("4822", "sel-de-test-0001"));
});

test("tableau combiné : repas et barge dans un seul bloc", () => {
  const block = liveToolBlock("tableau_combine", { parties: [{ service: "repas", demande: "un tacos" }, { service: "barge", demande: "deux piétons" }] }, { food: true, barge: true });
  assert.ok(block);
  const parts = parseCombined(block.split("\n")[1]);
  assert.deepEqual(parts.map((p) => p.kind), ["commande-repas", "ticket-barge"]);
});

test("tableau combiné : un service fermé à ce compte est retiré", () => {
  const block = liveToolBlock("tableau_combine", { parties: [{ service: "repas", demande: "un tacos" }, { service: "devis", demande: "un mur" }] }, { food: false, barge: false });
  assert.deepEqual(parseCombined(block?.split("\n")[1] ?? "").map((p) => p.kind), ["devis-btm"]);
  assert.equal(liveToolBlock("tableau_combine", { parties: [{ service: "barge" }] }, { food: false, barge: false }), null);
});

test("bloc combiné abîmé ou piégé : rien d'inconnu ne s'affiche", () => {
  assert.deepEqual(parseCombined("pas du json"), []);
  assert.deepEqual(parseCombined('[{"kind":"script","spec":"x"},{"kind":"ticket-barge","spec":3}]'), []);
  assert.equal(parseCombined(combinedBlock(Array.from({ length: 9 }, () => ({ kind: "devis-btm" as const, spec: "mur" }))).split("\n")[1]).length, 4);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { pickControl, toIsoDate } from "../src/lib/voice-live/board";

// Libellés que Tamilya voit sur l'attestation (nom complet, sinon le texte affiché).
const source = readFileSync("src/components/chat/AttestationHebergement.tsx", "utf8");
const labels = [...source.matchAll(/\{input\("\w+", "([^"]+)"([^\n]*)\)\}/g)].map((m) => /full: "([^"]+)"/.exec(m[2])?.[1] ?? m[1]);

test("chaque champ de l'attestation a un nom unique pour la voix", () => {
  assert.equal(labels.length, 14);
  assert.equal(new Set(labels).size, labels.length, labels.join(" | "));
});

test("Tamilya trouve le nom de chaque personne sans hésiter", () => {
  const controls = labels.map((label) => ({ label }));
  for (const wanted of ["Nom de l'hébergeant", "Prénom de la personne hébergée", "Date de naissance de l'hébergeant", "Lieu de naissance de la personne hébergée"]) {
    const picked = pickControl(controls, wanted);
    assert.ok("found" in picked && picked.found.label === wanted, wanted);
  }
});

test("une date dite à l'oral devient une date de champ", () => {
  assert.equal(toIsoDate("12 mars 1990"), "1990-03-12");
  assert.equal(toIsoDate("1er août 2026"), "2026-08-01");
  assert.equal(toIsoDate("le samedi 7 novembre 2026"), "2026-11-07");
  assert.equal(toIsoDate("07/11/2026"), "2026-11-07");
  assert.equal(toIsoDate("2026-11-07"), "2026-11-07");
});

test("une date incomplète ou fausse n'est pas écrite", () => {
  for (const bad of ["mars 1990", "31 février 2020", "12 brumaire 1990", "demain", "12/1990"]) assert.equal(toIsoDate(bad), null, bad);
});

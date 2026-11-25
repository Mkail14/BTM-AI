import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPlace } from "../src/lib/mayotte/place-intent";

const name = (message: string, before: string[] = []) => detectPlace(message, before)?.name ?? null;

test("question de lieu : la carte s'ouvre sur le lieu", () => {
  assert.equal(name("c'est ou chiconi"), "Chiconi");
  assert.equal(name("C'est où Chiconi ?"), "Chiconi");
  assert.equal(name("cest ou sada"), "Sada");
  assert.equal(name("où se trouve Combani"), "Combani");
  assert.equal(name("ou est mtsapere"), "M'Tsapéré");
  assert.equal(name("Chiconi c'est où ?"), "Chiconi");
  assert.equal(name("Bandrélé se trouve où exactement"), "Bandrélé");
  assert.equal(name("montre-moi Kawéni sur la carte"), "Kawéni");
  assert.equal(name("situe Dzaoudzi"), "Dzaoudzi");
  assert.equal(name("la carte de Mamoudzou"), "Mamoudzou");
  assert.equal(name("c'est où le village de Chiconi ?"), "Chiconi");
});

test("carte de Mayotte : l'île entière, même avec des fautes de frappe", () => {
  const island = (message: string) => detectPlace(message);
  for (const message of ["mntre la carte de mayotte", "montre la carte de mayotte", "Montre moi l acarte de Mayotte", "la carte de l'île", "c'est où Mayotte ?"]) {
    assert.equal(island(message)?.name, "Mayotte", message);
    assert.equal(island(message)?.town, null, message);
  }
  assert.equal(name("mntre la carte de Chiconi"), "Chiconi");
  assert.equal(name("tu peux me montrer la carte de Sada stp"), "Sada");
});

test("relance « montre », « la carte » : le lieu du message d'avant", () => {
  assert.equal(name("montre", ["c'est ou chiconi"]), "Chiconi");
  assert.equal(name("la carte", ["montre", "c'est ou chiconi"]), "Chiconi");
  assert.equal(name("montre-moi sur la carte", ["où se trouve Sada ?"]), "Sada");
  assert.equal(name("montre", ["bonjour"]), null);
  assert.equal(name("la carte"), null);
});

test("« oui », « ok » au début et relance « et Trévani ? »", () => {
  assert.equal(name("Oui c'est ou chiconi"), "Chiconi");
  assert.equal(name("ok bon c'est où Sada ?"), "Sada");
  assert.equal(name("Et trevani ?", ["Oui c'est ou chiconi"]), "Trévani");
  assert.equal(name("et Combani", ["où se trouve Sada"]), "Combani");
  assert.equal(name("Et trevani ?"), null);
  assert.equal(name("et toi ?", ["c'est où chiconi"]), null);
  assert.equal(name("et trevani ?", ["bonjour"]), null);
});

test("« tu sais c'est où Cavani ? » : la carte s'ouvre aussi", () => {
  assert.equal(name("Tu sais c'est ou Cavani ?"), "Cavani");
  assert.equal(name("tu sais où se trouve Combani"), "Combani");
  assert.equal(name("est-ce que tu sais c'est où Sada"), "Sada");
  assert.equal(name("Tu sais où c'est Kavani ?"), "Cavani");
  assert.equal(name("tu sais"), null);
});

test("« il est où », « tu connais », noms courts : la carte s'ouvre", () => {
  assert.equal(name("Il est où Tanaraki ?"), "Tanaraki");
  assert.equal(name("elle se trouve où Chiconi"), "Chiconi");
  assert.equal(name("Tu connais Sada ?"), "Sada");
  assert.equal(name("est-ce que tu connais Combani"), "Combani");
  assert.equal(name("tu connais le mot pavani ?"), null);
  assert.equal(name("tu connais la chanson"), null);
  assert.equal(name("Montre-moi La Vigie"), "La Vigie");
  assert.equal(name("Montre-moi Les Hauts Vallons"), "Les Hauts Vallons");
  assert.equal(name("c'est où Majicavo ?"), "Majicavo-Koropa");
  assert.equal(name("c'est où Dzoumonyé ?"), "Dzoumogné");
  assert.equal(name("c'est où Mgombani ?"), "M'Gombani");
  assert.equal(name("c'est où Hamaha ?"), "Hamaha");
});

test("pas une question de lieu : pas de carte", () => {
  assert.equal(name("Chiconi"), null);
  assert.equal(name("j'habite à Chiconi"), null);
  assert.equal(name("c'est où la CSSM"), null);
  assert.equal(name("ou est ce que je peux manger"), null);
  assert.equal(name("je veux une carte d'identité"), null);
  assert.equal(name("tu vas où ?"), null);
  assert.equal(name("trouve-moi un travail à Chiconi"), null);
  assert.equal(name("montre-moi une vidéo"), null);
  assert.equal(name("j'ai perdu ma carte de crédit"), null);
  assert.equal(name("comment avoir une carte de séjour"), null);
  assert.equal(name("la carte du restaurant"), null);
});

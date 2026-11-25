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

test("relance « montre », « la carte » : le lieu du message d'avant", () => {
  assert.equal(name("montre", ["c'est ou chiconi"]), "Chiconi");
  assert.equal(name("la carte", ["montre", "c'est ou chiconi"]), "Chiconi");
  assert.equal(name("montre-moi sur la carte", ["où se trouve Sada ?"]), "Sada");
  assert.equal(name("montre", ["bonjour"]), null);
  assert.equal(name("la carte"), null);
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
});

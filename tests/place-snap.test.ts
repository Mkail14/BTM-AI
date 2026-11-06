import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applySpelling, fixFieldValue, matchPlace, matchVoie, placesIn, spelledWords, type Voie } from "@/lib/voice-live/place-snap";
import voiesJson from "@/lib/voice-live/mayotte-voies.json";

const voies = voiesJson as Voie[];

describe("adresses de Mayotte remplies à la voix", () => {
  it("lit un mot épelé lettre par lettre", () => {
    assert.deepEqual(spelledWords("c'est T S I V E R E"), ["tsivere"]);
    assert.deepEqual(spelledWords("T, S, I, V, E, R, E accent aigu"), ["tsiveré"]);
    assert.deepEqual(spelledWords("té esse i vé e erre e"), ["tsivere"]);
    assert.deepEqual(spelledWords("il y a une rue"), []);
  });

  it("remplace le mot mal entendu par le mot épelé", () => {
    assert.equal(applySpelling("587 boulevard Sivré", ["tsivere"]), "587 boulevard Tsivere");
    assert.equal(applySpelling("Sivré", ["tsivere"]), "Tsivere");
  });

  it("reconnaît les rues de la base officielle", () => {
    assert.equal(matchVoie("boulevard Sivré", voies)?.[0], "Boulevard Tsiveré");
    assert.equal(matchVoie("boulevard Tsiveré", voies)?.[1], "Koungou");
    assert.equal(matchVoie("rue qui n'existe vraiment pas du tout", voies), null);
  });

  it("reconnaît les villes et villages", () => {
    assert.equal(matchPlace("koungou"), "Koungou");
    assert.equal(matchPlace("Kaweni"), "Kawéni");
    assert.equal(matchPlace("Paris"), null);
    assert.deepEqual(placesIn("mets Koungou en ville"), ["Koungou"]);
  });

  it("écrit la ville dite, pas celle devinée par le code postal", async () => {
    const fixed = await fixFieldValue("Ville", "Mamoudzou", "non mets Koungou en ville");
    assert.equal(fixed.value, "Koungou");
    // Village dit, commune écrite : c'est juste, on n'y touche pas.
    assert.equal((await fixFieldValue("Ville", "Mamoudzou", "j'habite à Kawéni")).value, "Mamoudzou");
    // Lieu hors de Mayotte : reste tel quel.
    assert.equal((await fixFieldValue("Lieu de naissance de l'hébergeant", "Paris", "né à Paris")).value, "Paris");
  });

  it("corrige l'adresse épelée et donne sa commune", async () => {
    const fixed = await fixFieldValue("Adresse du logement", "587 boulevard Sivré", "587 boulevard T S I V E R E");
    assert.equal(fixed.value, "587 Boulevard Tsiveré");
    assert.match(fixed.note ?? "", /Koungou/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectJobs, jobsBlock, jobsSpecOf, jobsTownFor } from "@/lib/emploi/intent";

describe("offres d'emploi : demande reconnue", () => {
  for (const message of [
    "je veux voir tout les poste actuel a mayotte",
    "montre moi les offres d'emploi",
    "Il y a quoi comme offres de travail à Koungou ?",
    "je cherche du boulot",
    "je recherche un CDI à Mamoudzou",
    "qui recrute en ce moment ?",
    "les postes à pourvoir",
    "il y a des jobs ?",
  ]) {
    it(message, () => assert.equal(detectJobs(message), true));
  }

  for (const message of ["mon travail me fatigue", "je vais à la poste", "c'est quoi le chômage", "j'ai un poste de télé"]) {
    it(`pas une demande : ${message}`, () => assert.equal(detectJobs(message), false));
  }
});

describe("offres d'emploi : commune et bloc", () => {
  it("lit la commune", () => {
    assert.equal(jobsTownFor("qui recrute à Koungou ?"), "Koungou");
    assert.equal(jobsTownFor("offres à Kawéni"), "Mamoudzou");
    assert.equal(jobsTownFor("offres d'emploi"), "");
  });

  it("relit le bloc qu'il écrit", () => {
    assert.deepEqual(jobsSpecOf(jobsBlock({ metier: "infirmier", ville: "Sada" })), { metier: "infirmier", ville: "Sada" });
    assert.deepEqual(jobsSpecOf(jobsBlock()), { metier: "", ville: "" });
  });

  it("ignore le modèle recopié tel quel", () => {
    assert.deepEqual(jobsSpecOf("metier: <métier cherché ou rien>\nville: "), { metier: "", ville: "" });
    assert.equal(jobsSpecOf("metier: rien").metier, "");
  });
});

describe("événements emploi", async () => {
  const { detectEvents, detectIdle, eventLine } = await import("@/lib/emploi/events");

  for (const message of ["il y a des job datings ?", "des événements emploi cette semaine ?", "un salon de l'emploi bientôt ?", "une réunion d'information collective"]) {
    it(`demande : ${message}`, () => assert.equal(detectEvents(message), true));
  }
  for (const message of ["je sais pas quoi faire de mes journées", "je m'ennuie grave", "j'ai rien à faire", "je tourne en rond à la maison", "je sais plus quoi faire"]) {
    it(`journées vides : ${message}`, () => assert.equal(detectIdle(message), true));
  }
  for (const message of ["je sais pas quoi faire à manger", "un événement ce soir ?", "je suis fatigué"]) {
    it(`rien : ${message}`, () => {
      assert.equal(detectEvents(message), false);
      assert.equal(detectIdle(message), false);
    });
  }

  it("ligne du prompt en heure de Mayotte", () => {
    const line = eventLine({ id: 1, title: "Job Dating Restauration", type: "Job dating", town: "Mamoudzou", start: "2026-11-26T05:30:00Z", end: null, remote: false, placesLeft: 10, organizer: null, link: "" });
    assert.match(line, /jeudi 26 novembre.*08:30.*Mamoudzou.*10 places/);
  });
});

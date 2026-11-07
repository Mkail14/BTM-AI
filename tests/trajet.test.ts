import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectTrip, formatMinutes, parseTripSpec, tripSpec } from "@/lib/trip/intent";

describe("trajet demandé", () => {
  it("part de chez soi quand on le dit", () => {
    assert.deepEqual(detectTrip("Combien de temps de chez moi à la CSSM ?"), { to: "cssm", from: null });
  });

  it("lit le départ et l'arrivée", () => {
    assert.deepEqual(detectTrip("comment aller à la mairie de Sada depuis Mamoudzou"), { to: "mairie de sada", from: "mamoudzou" });
    assert.deepEqual(detectTrip("de Sada à Pamandzi ça prend combien ?"), { to: "pamandzi", from: "sada" });
  });

  it("comprend les autres tournures", () => {
    assert.deepEqual(detectTrip("combien de temps pour aller à Bandrélé"), { to: "bandrele", from: null });
    assert.deepEqual(detectTrip("c'est loin la préfecture en taxi ?"), { to: "prefecture", from: null });
    assert.deepEqual(detectTrip("je veux aller à l'hôpital de Mamoudzou"), { to: "hopital de mamoudzou", from: null });
  });

  it("ne confond pas avec une livraison ou autre chose", () => {
    assert.equal(detectTrip("combien de temps pour ma livraison"), null);
    assert.equal(detectTrip("raconte une blague"), null);
  });

  it("écrit et relit le bloc", () => {
    assert.deepEqual(parseTripSpec(tripSpec({ to: "cssm", from: "sada" })), { to: "cssm", from: "sada" });
    assert.deepEqual(parseTripSpec("vers: mairie de sada"), { to: "mairie de sada", from: null });
    assert.equal(parseTripSpec("rien"), null);
  });

  it("dit les durées simplement", () => {
    assert.equal(formatMinutes(18), "18 min");
    assert.equal(formatMinutes(65), "1 h 05");
  });
});

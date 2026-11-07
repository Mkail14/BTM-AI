import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveIntent } from "@/lib/live/intent";
import { matchServices, servicesAsked, toService, type PublicService } from "@/lib/live/services";

const service = (name: string, commune: string): PublicService => ({
  name,
  commune,
  address: null,
  phones: [],
  email: null,
  hours: null,
  link: null,
});

const ALL = [
  service("Mairie - Mamoudzou", "97611"),
  service("Mairie - Sada", "97616"),
  service("Préfecture - Mayotte", "97611"),
  service("Brigade de gendarmerie - Sada", "97616"),
  service("France services - Tsingoni - Combani", "97617"),
];

describe("services publics de Mayotte", () => {
  it("reconnaît les demandes", () => {
    assert.equal(servicesAsked("c'est quoi les horaires de la mairie de Sada ?"), true);
    assert.equal(servicesAsked("raconte-moi une blague"), false);
  });

  it("choisit la commune citée", () => {
    const { found } = matchServices(ALL, "horaires de la mairie de Sada");
    assert.deepEqual(found.map((s) => s.name), ["Mairie - Sada"]);
  });

  it("reconnaît un village", () => {
    const { found } = matchServices(ALL, "france services à Combani");
    assert.deepEqual(found.map((s) => s.name), ["France services - Tsingoni - Combani"]);
  });

  it("cherche partout quand la commune n'en a pas", () => {
    const { found } = matchServices(ALL, "la préfecture à Sada, c'est ouvert ?");
    assert.deepEqual(found.map((s) => s.name), ["Préfecture - Mayotte"]);
  });

  it("lit une fiche de l'annuaire", () => {
    const s = toService({
      nom: "Mairie - Mamoudzou",
      code_insee_commune: "97611",
      adresse: JSON.stringify([{ type_adresse: "Adresse", numero_voie: "59 boulevard Halidi-Selemani", code_postal: "97600", nom_commune: "Mamoudzou" }]),
      telephone: JSON.stringify([{ valeur: "02 69 66 50 10" }]),
      plage_ouverture: JSON.stringify([
        { nom_jour_debut: "Lundi", nom_jour_fin: "Jeudi", valeur_heure_debut_1: "07:30:00", valeur_heure_fin_1: "16:00:00" },
      ]),
    });
    assert.equal(s?.address, "59 boulevard Halidi-Selemani, 97600 Mamoudzou");
    assert.deepEqual(s?.phones, ["02 69 66 50 10"]);
    assert.equal(s?.hours, "du lundi au jeudi 7 h 30-16 h");
  });
});

describe("météo et communes", () => {
  it("reconnaît les questions", () => {
    assert.equal(liveIntent("il va pleuvoir demain ?").weather, true);
    assert.equal(liveIntent("combien d'habitants à Koungou ?").communes, true);
    assert.equal(liveIntent("je veux un tacos").weather, false);
  });
});

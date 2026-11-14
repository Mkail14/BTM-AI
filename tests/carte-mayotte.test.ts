import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeRoute, describeTown, findTown } from "@/lib/mayotte/towns";
import { MAP_RULES, MAP_TOOLS, mapToolDeclarations } from "@/lib/voice-live/map-mode";
import { readLiveTicket, signLiveTicket } from "@/lib/voice-live/ticket";

describe("carte de la page Mayotte", () => {
  it("trouve une commune, même mal écrite", () => {
    const sada = findTown("sada");
    assert.equal(sada?.name, "Sada");
    assert.equal(sada?.isCommune, true);
    assert.equal(sada?.commune, "Sada");
    assert.match(sada!.where, /centre de Grande-Terre, côté ouest/);
    assert.equal(findTown("mtsapere")?.name, "M'Tsapéré");
    assert.equal(findTown("Mamoudzou, Mayotte")?.isCommune, true);
  });

  it("rattache un village à sa commune", () => {
    const combani = findTown("Combani");
    assert.equal(combani?.isCommune, false);
    assert.equal(combani?.commune, "Tsingoni");
    assert.equal(findTown("Kawéni")?.commune, "Mamoudzou");
    assert.match(findTown("Labattoir")!.where, /Petite-Terre/);
  });

  it("ne trouve pas ce qui n'est pas à Mayotte", () => {
    assert.equal(findTown("Paris"), null);
    assert.equal(findTown(""), null);
  });

  it("ne donne à Tamilya que des faits sûrs", () => {
    const text = describeTown(findTown("Combani")!, "14 000");
    assert.match(text, /village de la commune de Tsingoni/);
    assert.match(text, /14 000 habitants/);
    assert.doesNotMatch(describeTown(findTown("Combani")!, null), /habitants/);
  });

  it("décrit un trajet avec ses seuls faits sûrs", () => {
    const [trevani, sada, labattoir] = [findTown("Trévani")!, findTown("Sada")!, findTown("Labattoir")!];
    const text = describeRoute(trevani, sada, { km: 27.4, minutes: 48 });
    assert.match(text, /de Trévani à Sada/);
    assert.match(text, /27,4 km/);
    assert.match(text, /48 minutes/);
    assert.doesNotMatch(text, /barge/);
    assert.match(describeRoute(trevani, labattoir, { km: 12, minutes: 75 }), /1 h 15[\s\S]*barge/);
    // Route pas calculée : aucun chiffre à dire.
    assert.doesNotMatch(describeRoute(trevani, sada, null), /\d/);
  });

  it("n'a que les boutons de la carte", () => {
    assert.deepEqual(mapToolDeclarations().map((d) => d.name), [...MAP_TOOLS]);
    assert.match(MAP_RULES, /montrer_ville/);
    assert.doesNotMatch(MAP_RULES, /kibushi/i);
  });

  it("le ticket garde le mode carte", () => {
    const user = { id: "u", isAdmin: false };
    assert.equal(readLiveTicket(signLiveTicket(user, "s", Date.now(), false, undefined, true), "s")?.map, true);
    assert.equal(readLiveTicket(signLiveTicket(user, "s"), "s")?.map, undefined);
  });

  it("le ticket d'un visiteur sans compte est marqué, celui d'un compte ne l'est pas", () => {
    const guest = readLiveTicket(signLiveTicket({ id: "visiteur", isAdmin: false }, "s", Date.now(), false, undefined, true, true), "s");
    assert.equal(guest?.guest, true);
    assert.equal(guest?.map, true);
    assert.equal(guest?.admin, false);
    assert.equal(readLiveTicket(signLiveTicket({ id: "u", isAdmin: false }, "s", Date.now(), false, undefined, true), "s")?.guest, undefined);
  });
});

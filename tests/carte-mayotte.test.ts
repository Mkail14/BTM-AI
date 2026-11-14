import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeTown, findTown } from "@/lib/mayotte/towns";
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

  it("n'a que les deux boutons de la carte", () => {
    assert.deepEqual(mapToolDeclarations().map((d) => d.name), [...MAP_TOOLS]);
    assert.match(MAP_RULES, /montrer_ville/);
    assert.doesNotMatch(MAP_RULES, /kibushi/i);
  });

  it("le ticket garde le mode carte", () => {
    const user = { id: "u", isAdmin: false };
    assert.equal(readLiveTicket(signLiveTicket(user, "s", Date.now(), false, undefined, true), "s")?.map, true);
    assert.equal(readLiveTicket(signLiveTicket(user, "s"), "s")?.map, undefined);
  });
});

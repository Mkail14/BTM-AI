import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { findSlot, listSlots } from "@/lib/code-exam/slots";

describe("créneaux du code de la route", () => {
  // Lundi 2 novembre 2026, 10 h à Mayotte.
  const now = new Date("2026-11-02T07:00:00Z");

  it("propose des créneaux à partir de demain, jamais le dimanche", () => {
    const slots = listSlots(now);
    assert.ok(slots.length > 0);
    assert.ok(slots.every((s) => new Date(s.startsAt) > now));
    assert.ok(!slots.some((s) => s.startsAt.startsWith("2026-11-08")), "le dimanche 8 est fermé");
  });

  it("donne les mêmes créneaux à chaque appel", () => {
    assert.deepEqual(listSlots(now), listSlots(now));
  });

  it("retrouve un créneau quelle que soit l'écriture de l'heure", () => {
    const slot = listSlots(now)[0];
    const utc = new Date(slot.startsAt).toISOString();
    assert.deepEqual(findSlot(slot.centerId, utc, now), slot);
    assert.equal(findSlot("inconnu", utc, now), null);
  });

  it("n'apprend le tableau à Awa que dans la conversation écrite", () => {
    assert.match(buildSystemPrompt(undefined, {}), /creneaux-code/);
    assert.doesNotMatch(buildSystemPrompt(undefined, { voice: true }), /creneaux-code/);
    assert.doesNotMatch(buildSystemPrompt(undefined, { teacher: true }), /creneaux-code/);
  });
});

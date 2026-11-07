import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canCancel, cancelDeadline } from "@/lib/food/cancel";

// Préparation prévue samedi 7 novembre 2026 à 19 h (heure de Mayotte, UTC+3).
const placedAt = "2026-11-07T16:00:00Z";
const at = (iso: string) => Date.parse(iso);

describe("annulation d'une commande programmée", () => {
  it("s'arrête 4 h avant la préparation", () => {
    assert.equal(cancelDeadline(placedAt), at("2026-11-07T12:00:00Z"));
  });

  it("est possible avant la limite", () => {
    assert.equal(canCancel({ placedAt }, at("2026-11-07T11:59:00Z")), true);
  });

  it("n'est plus possible à la limite ni après", () => {
    assert.equal(canCancel({ placedAt }, at("2026-11-07T12:00:00Z")), false);
    assert.equal(canCancel({ placedAt }, at("2026-11-07T15:00:00Z")), false);
  });

  it("ne rembourse pas deux fois", () => {
    assert.equal(canCancel({ placedAt, cancelled: true }, at("2026-11-07T08:00:00Z")), false);
  });
});

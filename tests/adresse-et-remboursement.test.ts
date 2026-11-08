import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { needsAddressCheck } from "../src/lib/auth/address-notice";
import { refundDecision, refundRequestEmail } from "../src/lib/wallet/refund-on-delete";

describe("Prévenir les adresses abîmées à l'inscription (faute /s+/ du 2026-11-02)", () => {
  const signup = (line: string, at = "2026-11-05T10:00:00Z", created = at) => ({ address_line: line, address_updated_at: at, created_at: created });

  it("prévient une adresse d'inscription sans « s » pendant la période", () => {
    assert.equal(needsAddressCheck(signup("12 rue de Ro e")), true);
  });

  it("ne prévient pas une adresse qui contient un « s » (elle n'est pas passée par la faute)", () => {
    assert.equal(needsAddressCheck(signup("12 rue des Roses")), false);
  });

  it("ne prévient pas avant la faute, ni une adresse réenregistrée depuis", () => {
    assert.equal(needsAddressCheck(signup("12 rue de Ro e", "2026-11-01T10:00:00Z")), false);
    assert.equal(needsAddressCheck(signup("12 rue de Ro e", "2026-11-07T10:00:00Z", "2026-11-05T10:00:00Z")), false);
  });

  it("ne prévient pas sans adresse ou avec des données incomplètes", () => {
    assert.equal(needsAddressCheck(null), false);
    assert.equal(needsAddressCheck({ address_line: null, address_updated_at: "2026-11-05T10:00:00Z", created_at: "2026-11-05T10:00:00Z" }), false);
    assert.equal(needsAddressCheck({ address_line: "12 rue de Ro e" }), false);
  });
});

describe("Suppression de compte avec de l'argent (règle du 2026-11-08)", () => {
  const now = Date.parse("2026-11-08T12:00:00Z");

  it("compte non banni avec un solde : remboursement demandé", () => {
    assert.deepEqual(refundDecision({ balanceCents: 4250, demo: false, bannedUntil: null, now }), { kind: "request", balanceCents: 4250 });
  });

  it("compte banni : pas de remboursement", () => {
    assert.deepEqual(refundDecision({ balanceCents: 4250, demo: false, bannedUntil: "2099-01-01T00:00:00Z", now }), { kind: "forfeit", balanceCents: 4250 });
  });

  it("bannissement terminé : le compte n'est plus banni, remboursement demandé", () => {
    assert.equal(refundDecision({ balanceCents: 100, demo: false, bannedUntil: "2026-01-01T00:00:00Z", now }).kind, "request");
  });

  it("solde nul ou argent fictif : rien à rembourser", () => {
    assert.equal(refundDecision({ balanceCents: 0, demo: false, now }).kind, "none");
    assert.equal(refundDecision({ balanceCents: 5000, demo: true, now }).kind, "none");
  });

  it("l'e-mail à l'équipe donne le montant, l'adresse et l'identifiant", () => {
    const mail = refundRequestEmail({ userId: "u-1", email: "a@b.yt", balanceCents: 4250, at: new Date(now) });
    assert.match(mail.subject, /42,50 €/);
    assert.match(mail.text, /a@b\.yt/);
    assert.match(mail.text, /u-1/);
    assert.doesNotMatch(mail.html, /<script/);
  });
});

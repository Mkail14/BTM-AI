import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminGateValue, adminLockPath, isAdminGatedPath, isAdminGateOpen } from "@/lib/admin/gate";

const MINUTE = 60_000;
const now = Date.UTC(2026, 10, 13, 9);

describe("verrou de l'espace admin", () => {
  it("garde tout /admin sauf la page du code", () => {
    assert.equal(isAdminGatedPath("/admin"), true);
    assert.equal(isAdminGatedPath("/admin/lexique"), true);
    assert.equal(isAdminGatedPath("/admin/verrou"), false);
    assert.equal(isAdminGatedPath("/administration"), false);
    assert.equal(isAdminGatedPath("/voix"), false);
  });

  it("ramène à la page demandée, jamais hors de l'admin", () => {
    assert.equal(adminLockPath("/admin/lexique?onglet=mots"), `/admin/verrou?suite=${encodeURIComponent("/admin/lexique?onglet=mots")}`);
    assert.equal(adminLockPath("//pirate.example"), `/admin/verrou?suite=${encodeURIComponent("/admin")}`);
    assert.equal(adminLockPath("/parametres"), `/admin/verrou?suite=${encodeURIComponent("/admin")}`);
  });

  it("reste ouvert moins de 15 minutes après la dernière utilisation", () => {
    const value = adminGateValue("u1", now) ?? undefined;
    assert.ok(value);
    assert.equal(isAdminGateOpen(value, "u1", now + 14 * MINUTE), true);
    assert.equal(isAdminGateOpen(value, "u1", now + 15 * MINUTE), false);
  });

  it("refuse un autre compte, un cookie absent ou modifié", () => {
    const value = adminGateValue("u1", now) ?? "";
    assert.equal(isAdminGateOpen(value, "u2", now), false);
    assert.equal(isAdminGateOpen(undefined, "u1", now), false);
    const [payload, signature] = value.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "u1", seen: now + 60 * MINUTE })).toString("base64url");
    assert.equal(isAdminGateOpen(`${forged}.${signature}`, "u1", now + 30 * MINUTE), false);
    assert.equal(isAdminGateOpen(`${payload}.x${signature.slice(1)}`, "u1", now), false);
  });
});

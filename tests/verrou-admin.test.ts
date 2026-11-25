import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adminGateValue,
  adminLockPath,
  codeOffFromMetadata,
  idleFromMetadata,
  isAdminGatedPath,
  isAdminGateOpen,
  readAdminGate,
} from "../src/server/services/admin/gate";

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

  it("suit le délai choisi, ou ne se referme jamais", () => {
    const hour = adminGateValue("u1", now, 60) ?? undefined;
    assert.equal(readAdminGate(hour, "u1", now + 59 * MINUTE), 60);
    assert.equal(readAdminGate(hour, "u1", now + 60 * MINUTE), null);
    const never = adminGateValue("u1", now, 0) ?? undefined;
    assert.equal(readAdminGate(never, "u1", now + 300 * 24 * 60 * MINUTE), 0);
    assert.equal(readAdminGate(never, "u2", now), null);
    // Délai hors liste (cookie fabriqué avec la bonne clé ailleurs) : refusé.
    assert.equal(readAdminGate(adminGateValue("u1", now, 7) ?? undefined, "u1", now), null);
  });

  it("lit le délai du compte, 15 minutes sinon", () => {
    assert.equal(idleFromMetadata({ admin_gate_idle: 240 }), 240);
    assert.equal(idleFromMetadata({ admin_gate_idle: 0 }), 0);
    assert.equal(idleFromMetadata({ admin_gate_idle: 7 }), 15);
    assert.equal(idleFromMetadata(undefined), 15);
    assert.equal(codeOffFromMetadata({ admin_code_off: true }), true);
    assert.equal(codeOffFromMetadata({ admin_code_off: null }), false);
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

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { meshClosure } from "../src/lib/mesh/closure";

const PROD = { VERCEL_GIT_COMMIT_REF: "main" };

describe("Tamilya Connect pendant la maintenance (2026-11-08 : plus de silence sans fin)", () => {
  it("un administrateur a une vraie réponse, même site fermé", () => {
    assert.equal(meshClosure(true, "waiting_partner", PROD), null);
    assert.equal(meshClosure(true, "maintenance", PROD), null);
  });

  it("un autre compte reçoit une réponse claire au lieu d'attendre dans le vide", () => {
    assert.match(meshClosure(false, "waiting_partner", PROD) ?? "", /ouvre bientôt/);
    assert.match(meshClosure(false, "maintenance", PROD) ?? "", /maintenance/);
  });

  it("site ouvert : tout le monde a une vraie réponse", () => {
    assert.equal(meshClosure(false, "online", PROD), null);
  });

  it("le proxy laisse passer la route du relais (sinon la page d'attente bloquait la réponse)", () => {
    const proxy = readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
    assert.match(proxy, /OPEN_WHEN_CLOSED = \[[^\]]*"\/api\/mesh\/relay"/);
  });
});

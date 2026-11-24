import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasAdminRole, hasPrincipalAdminRole } from "@/server/middlewares/roles";
import { siteClosure } from "@/lib/site/status";

describe("États du site", () => {
  it("ferme le site au public en maintenance et en attente d'un partenaire, pas en ligne", () => {
    assert.equal(siteClosure("online"), null);
    assert.match(siteClosure("maintenance")?.apiError ?? "", /maintenance/);
    assert.match(siteClosure("waiting_partner")?.apiError ?? "", /bientôt/);
  });

  it("page d'attente lisible (200) en attente d'un partenaire, 503 en maintenance", () => {
    assert.equal(siteClosure("waiting_partner")?.pageStatus, 200);
    assert.equal(siteClosure("maintenance")?.pageStatus, 503);
  });

  it("ne ferme jamais le site de la branche develop", () => {
    assert.equal(siteClosure("maintenance", { VERCEL_GIT_COMMIT_REF: "develop" }), null);
    assert.equal(siteClosure("waiting_partner", { VERCEL_GIT_COMMIT_REF: "develop" }), null);
    assert.notEqual(siteClosure("maintenance", { VERCEL_GIT_COMMIT_REF: "main" }), null);
  });
});

describe("Administrateurs", () => {
  it("distingue l'administrateur principal du délégué", () => {
    const principal = { app_metadata: { role: "admin" } };
    const secondary = { app_metadata: { role: "admin", admin_level: "secondary" } };
    assert.equal(hasPrincipalAdminRole(principal), true);
    assert.equal(hasAdminRole(secondary), true);
    assert.equal(hasPrincipalAdminRole(secondary), false);
    assert.equal(hasPrincipalAdminRole({ app_metadata: { role: null } }), false);
    // Le rôle ne se lit jamais dans user_metadata, modifiable par la personne elle-même.
    assert.equal(hasPrincipalAdminRole({ user_metadata: { role: "admin" } }), false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasAdminRole, hasPrincipalAdminRole } from "@/lib/auth/roles";
import { formatIban, isValidBic, isValidIban } from "@/lib/site/iban";

describe("Profil de l'entreprise", () => {
  it("vérifie la clé d'un IBAN, espaces et minuscules compris", () => {
    assert.equal(isValidIban("FR76 3000 6000 0112 3456 7890 189"), true);
    assert.equal(isValidIban("fr7630006000011234567890189"), true);
    assert.equal(isValidIban("FR76 3000 6000 0112 3456 7890 188"), false);
    assert.equal(isValidIban("FR76"), false);
    assert.equal(formatIban("fr7630006000011234567890189"), "FR76 3000 6000 0112 3456 7890 189");
  });

  it("accepte un BIC de 8 ou 11 caractères", () => {
    assert.equal(isValidBic("BNPAFRPP"), true);
    assert.equal(isValidBic("bnpa frpp xxx"), true);
    assert.equal(isValidBic("BNPA"), false);
  });

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

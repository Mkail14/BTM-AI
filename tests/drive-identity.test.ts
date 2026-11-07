import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleSubject, ownsGoogleIdentity } from "../src/lib/drive/identity";

const token = (payload: object) => `x.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.y`;

describe("Drive : le Google relié est-il déjà celui du compte ?", () => {
  it("lit l'identifiant Google du jeton", () => {
    assert.equal(googleSubject(token({ sub: "1234", email: "a@b.c" })), "1234");
    assert.equal(googleSubject("pas-un-jeton"), null);
    assert.equal(googleSubject(token({ email: "a@b.c" })), null);
  });

  it("reconnaît une identité Google du compte (connexion faite avec ce Google)", () => {
    const identities = [
      { provider: "email", id: "x" },
      { provider: "google", id: "1234", identity_data: { sub: "1234" } },
    ];
    assert.equal(ownsGoogleIdentity(identities, "1234"), true);
    assert.equal(ownsGoogleIdentity([{ provider: "google", id: "autre", identity_data: { sub: "1234" } }], "1234"), true);
  });

  it("refuse un autre Google, un autre fournisseur ou un identifiant manquant", () => {
    assert.equal(ownsGoogleIdentity([{ provider: "google", id: "9999", identity_data: { sub: "9999" } }], "1234"), false);
    assert.equal(ownsGoogleIdentity([{ provider: "email", id: "1234" }], "1234"), false);
    assert.equal(ownsGoogleIdentity([{ provider: "google", id: "1234" }], null), false);
    assert.equal(ownsGoogleIdentity(undefined, "1234"), false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { storedSlot } from "@/lib/ai/registry";
import { canEncrypt, decryptSecret, encryptSecret } from "@/lib/ai/secret-box";

const env = { AI_KEYS_SECRET: "secret-de-test", AI_MAX_OUTPUT_TOKENS: "2048" };

describe("secret-box", () => {
  it("chiffre et déchiffre une clé, sans la laisser lisible", () => {
    const sealed = encryptSecret("sk-or-v1-abcdef123456", env);
    assert.ok(!sealed.includes("abcdef"));
    assert.equal(decryptSecret(sealed, env), "sk-or-v1-abcdef123456");
  });

  it("rend une clé illisible si le secret change ou si la donnée est altérée", () => {
    const sealed = encryptSecret("cle", env);
    assert.equal(decryptSecret(sealed, { AI_KEYS_SECRET: "autre" }), null);
    assert.equal(decryptSecret(`${sealed.slice(0, -2)}xx`, env), null);
  });

  it("refuse de chiffrer sans secret", () => {
    assert.equal(canEncrypt({}), false);
    assert.throws(() => encryptSecret("cle", {}));
  });
});

describe("storedSlot", () => {
  const row = {
    id: "0b0c3c8e-6d6b-4f0e-9a43-5d7c1c2b9a10",
    label: "Groq secours",
    provider: "openai-compatible" as const,
    base_url: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    api_key_encrypted: encryptSecret("gsk_cle_de_test", env),
  };

  it("reprend fournisseur, modèle et clé de la ligne, et les réglages communs de l'API principale", () => {
    const slot = storedSlot(row, 3, env);
    assert.equal(slot.id, `db-${row.id}`);
    assert.equal(slot.source, "db");
    assert.ok(slot.result.ok);
    if (slot.result.ok) {
      assert.equal(slot.result.config.apiKey, "gsk_cle_de_test");
      assert.equal(slot.result.config.model, "llama-3.3-70b-versatile");
      assert.equal(slot.result.config.maxOutputTokens, 2048);
    }
  });

  it("signale une clé devenue illisible", () => {
    const slot = storedSlot(row, 3, { AI_KEYS_SECRET: "autre" });
    assert.equal(slot.result.ok, false);
  });
});

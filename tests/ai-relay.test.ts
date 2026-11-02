import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { relayUrl, signRelay, verifyRelay } from "@/lib/ai/relay";

describe("relais local vers le site en ligne", () => {
  const body = JSON.stringify({ system: "s", messages: [{ role: "user", content: "Bonjour" }], maxOutputTokens: 100 });
  const now = Date.now();

  it("accepte une demande signée avec le bon secret", () => {
    assert.equal(verifyRelay(body, String(now), signRelay(body, now, "secret"), "secret", now), true);
  });

  it("refuse un autre secret, un corps modifié ou une signature trop ancienne", () => {
    assert.equal(verifyRelay(body, String(now), signRelay(body, now, "autre"), "secret", now), false);
    assert.equal(verifyRelay(`${body} `, String(now), signRelay(body, now, "secret"), "secret", now), false);
    const old = now - 10 * 60_000;
    assert.equal(verifyRelay(body, String(old), signRelay(body, old, "secret"), "secret", now), false);
    assert.equal(verifyRelay(body, null, null, "secret", now), false);
  });

  it("ne sert qu'en développement local", () => {
    assert.equal(relayUrl({ NODE_ENV: "development", AI_RELAY_URL: "https://www.btm.yt/" }), "https://www.btm.yt");
    assert.equal(relayUrl({ NODE_ENV: "production", AI_RELAY_URL: "https://www.btm.yt" }), null);
    assert.equal(relayUrl({ NODE_ENV: "development" }), null);
  });
});

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { formatEuros, parseEuros, topupError } from "../src/lib/wallet/limits";
import { verifyWebhook } from "../src/lib/wallet/stripe";

test("montants en euros", () => {
  assert.equal(formatEuros(1000).replace(/\s/g, " "), "10 €");
  assert.equal(formatEuros(1250).replace(/\s/g, " "), "12,50 €");
  assert.equal(parseEuros("12,5"), 1250);
  assert.equal(parseEuros("20 €"), 2000);
  assert.equal(parseEuros("abc"), null);
  assert.equal(parseEuros("1,234"), null);
});

test("recharge entre 5 € et 150 €, solde plafonné à 150 €", () => {
  assert.equal(topupError(500, 0), null);
  assert.equal(topupError(15_000, 0), null);
  assert.match(topupError(499, 0)!, /minimale/);
  assert.match(topupError(15_001, 0)!, /maximale/);
  assert.match(topupError(5_000, 12_000)!.replace(/\s/g, " "), /30 €/);
  assert.match(topupError(500, 14_800)!, /déjà au maximum/);
});

test("signature des webhooks Stripe", () => {
  const secret = "whsec_test";
  const payload = '{"id":"evt_1"}';
  const t = 1_800_000_000;
  const sig = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  assert.equal(verifyWebhook(payload, `t=${t},v1=${sig}`, secret, t * 1000), true);
  assert.equal(verifyWebhook(payload + " ", `t=${t},v1=${sig}`, secret, t * 1000), false);
  assert.equal(verifyWebhook(payload, `t=${t},v1=${sig}`, secret, (t + 600) * 1000), false);
  assert.equal(verifyWebhook(payload, null, secret), false);
});

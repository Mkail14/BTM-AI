import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { describeDevice } from "../src/lib/email/device";
import { verifyHookSignature, verifyLink } from "../src/lib/email/hook";
import { escapeHtml } from "../src/lib/email/layout";
import { EMAIL_SAMPLES, renderSample } from "../src/lib/email/samples";
import { formatWhen, passwordResetEmail } from "../src/lib/email/templates";

const ORIGIN = "https://btm.example";

describe("e-mails", () => {
  it("rend les cinq modèles avec objet, HTML et texte, sans « undefined »", () => {
    for (const sample of EMAIL_SAMPLES) {
      const email = renderSample(sample.id, ORIGIN, "fatima@exemple.fr");
      assert.ok(email.subject.length > 10, sample.id);
      assert.match(email.html, /^<!DOCTYPE html>/);
      assert.match(email.html, /contact@btm\.yt/);
      assert.match(email.html, /btm-ai-encre\.png/);
      assert.match(email.text, /L'équipe BTM AI/);
      assert.doesNotMatch(email.html + email.text, /undefined|null|\*\*/, sample.id);
    }
  });

  it("échappe ce qui vient de l'extérieur (adresse, lien)", () => {
    const email = passwordResetEmail('https://x.test/?a=1&b="2"', "<script>@x.fr", { origin: ORIGIN });
    assert.doesNotMatch(email.html, /<script>@/);
    assert.match(email.html, /&lt;script&gt;@x\.fr/);
    assert.match(email.html, /a=1&amp;b=&quot;2&quot;/);
    assert.equal(escapeHtml(`<a href="x">'`), "&lt;a href=&quot;x&quot;&gt;&#39;");
  });

  it("date lisible à l'heure de Mayotte", () => {
    // 2 novembre 2026, 11:05 UTC = 14:05 à Mayotte.
    assert.equal(formatWhen(new Date("2026-11-02T11:05:00Z")), "lundi 2 novembre à 14:05");
  });

  it("reconnaît les appareils courants", () => {
    assert.equal(
      describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"),
      "Safari sur iPhone",
    );
    assert.equal(
      describeDevice("Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"),
      "Chrome sur Android",
    );
    assert.equal(
      describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Edg/130.0"),
      "Edge sur Windows",
    );
    assert.equal(describeDevice(""), "Appareil inconnu");
  });

  it("n'accepte que les appels signés par Supabase, et récents", () => {
    const raw = Buffer.from("secret-de-test-assez-long").toString("base64");
    const secret = `v1,whsec_${raw}`;
    const body = '{"user":{}}';
    const now = Date.parse("2026-11-02T10:00:00Z");
    const timestamp = String(now / 1000);
    const sign = (content: string) => createHmac("sha256", Buffer.from(raw, "base64")).update(content).digest("base64");
    const good = { id: "msg_1", timestamp, signature: `v1,${sign(`msg_1.${timestamp}.${body}`)}` };

    assert.equal(verifyHookSignature(secret, body, good, now), true);
    assert.equal(verifyHookSignature(secret, body + " ", good, now), false, "corps modifié");
    assert.equal(verifyHookSignature(secret, body, { ...good, signature: "v1,AAAA" }, now), false);
    assert.equal(verifyHookSignature(secret, body, good, now + 10 * 60 * 1000), false, "trop ancien");
    assert.equal(verifyHookSignature(secret, body, { ...good, signature: null }, now), false);
  });

  it("construit le lien de vérification de Supabase", () => {
    const link = new URL(verifyLink("https://abc.supabase.co/", "hash123", "recovery", "https://btm.yt/auth/callback?next=%2F"));
    assert.equal(link.pathname, "/auth/v1/verify");
    assert.equal(link.searchParams.get("token"), "hash123");
    assert.equal(link.searchParams.get("type"), "recovery");
    assert.equal(link.searchParams.get("redirect_to"), "https://btm.yt/auth/callback?next=%2F");
  });
});

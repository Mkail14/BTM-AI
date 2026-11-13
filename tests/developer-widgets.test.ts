import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeOrigin } from "@/lib/developers/widgets";

describe("Widget des développeurs : adresses autorisées", () => {
  it("ramène l'adresse saisie à son origine https", () => {
    assert.equal(normalizeOrigin("mon-site.yt"), "https://mon-site.yt");
    assert.equal(normalizeOrigin("  WWW.Mon-Site.yt  "), "https://www.mon-site.yt");
    assert.equal(normalizeOrigin("https://mon-site.yt/contact?x=1"), "https://mon-site.yt");
    assert.equal(normalizeOrigin("https://mon-site.yt:8443/"), "https://mon-site.yt:8443");
  });

  it("accepte http seulement pour un essai en local", () => {
    assert.equal(normalizeOrigin("localhost:3000"), "https://localhost:3000");
    assert.equal(normalizeOrigin("http://localhost:3000"), "http://localhost:3000");
    assert.equal(normalizeOrigin("http://127.0.0.1:5500"), "http://127.0.0.1:5500");
    assert.equal(normalizeOrigin("http://mon-site.yt"), null);
  });

  it("refuse ce qui n'est pas une adresse de site", () => {
    assert.equal(normalizeOrigin(""), null);
    assert.equal(normalizeOrigin("intranet"), null);
    assert.equal(normalizeOrigin("javascript:alert(1)"), null);
    assert.equal(normalizeOrigin("ftp://mon-site.yt"), null);
  });
});

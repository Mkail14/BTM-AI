import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chunkText, htmlToText, trustOf } from "@/lib/library/text";

describe("bibliothèque Mayotte", () => {
  it("donne un niveau de confiance selon la source", () => {
    assert.equal(trustOf("https://www.mayotte.gouv.fr/actu"), "officiel");
    assert.equal(trustOf("https://www.mayotte.ars.sante.fr/"), "officiel");
    assert.equal(trustOf("https://www.departement976.fr/"), "officiel");
    assert.equal(trustOf("https://www.mamoudzou.yt/"), "officiel");
    assert.equal(trustOf("https://la1ere.franceinfo.fr/mayotte/"), "media");
    assert.equal(trustOf("https://blog-au-hasard.com/mayotte"), "autre");
    assert.equal(trustOf("https://faux-gouv.fr.pirate.com/"), "autre");
    assert.equal(trustOf(null), "autre");
  });

  it("garde le texte d'une page, sans menus ni scripts", () => {
    const { title, text } = htmlToText(
      "<html><head><title>Barge  de Mayotte</title><script>alert(1)</script></head><body><nav>Menu</nav><main><h1>Horaires</h1><p>Première barge &agrave; 5h.</p></main><footer>Pied</footer></body></html>",
    );
    assert.equal(title, "Barge de Mayotte");
    assert.ok(text.includes("Horaires") && text.includes("Première barge"));
    assert.ok(!/Menu|Pied|alert/.test(text));
  });

  it("découpe en passages qui se chevauchent, coupés entre deux phrases", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Phrase numéro ${i} sur la vie à Mayotte et ses communes.`).join(" ");
    const chunks = chunkText(text);
    assert.ok(chunks.length >= 3);
    assert.ok(chunks.every((c) => c.length <= 1_200));
    assert.ok(chunks[0].endsWith("."));
    assert.ok(chunks[1].startsWith(chunks[0].slice(-40, -30)) || chunks[0].includes(chunks[1].slice(0, 30)));
  });
});

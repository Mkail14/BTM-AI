import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyVoiceCorrections, CORRECTIONS_IN_PROMPT, listeningRules } from "@/lib/voice-live/listening";
import { MAYOTTE_PLACES } from "@/lib/voice-live/mayotte-places";

describe("Corrections d'écoute", () => {
  it("corrige un mot mal entendu, quelle que soit la casse", () => {
    assert.equal(applyVoiceCorrections("Je vais à Mamou Zou demain", [{ heard: "mamou zou", meant: "Mamoudzou" }]), "Je vais à Mamoudzou demain");
  });

  it("ne touche pas à un mot qui contient seulement l'expression", () => {
    assert.equal(applyVoiceCorrections("une barge embarquée", [{ heard: "barge", meant: "bargé" }, { heard: "embar", meant: "x" }]), "une bargé embarquée");
  });

  it("gère les accents et les caractères spéciaux sans les prendre pour une règle", () => {
    assert.equal(applyVoiceCorrections("c'est été (oui)", [{ heard: "été", meant: "ok" }]), "c'est ok (oui)");
    assert.equal(applyVoiceCorrections("a.b et axb", [{ heard: "a.b", meant: "z" }]), "z et axb");
  });

  it("applique l'expression la plus longue d'abord", () => {
    assert.equal(applyVoiceCorrections("petite terre", [{ heard: "terre", meant: "A" }, { heard: "petite terre", meant: "Pamandzi" }]), "Pamandzi");
  });

  it("garde tel quel un remplacement qui contient un dollar", () => {
    assert.equal(applyVoiceCorrections("prix", [{ heard: "prix", meant: "$&" }]), "$&");
  });

  it("donne les 17 communes et les lieux qui se ressemblent aux consignes", () => {
    const rules = listeningRules([]);
    assert.equal(Object.keys(MAYOTTE_PLACES).length, 17);
    assert.match(rules, /Trévani Village/);
    assert.match(rules, /Tahiti Plage/);
    assert.ok(rules.length < 3_000, `consignes trop lourdes : ${rules.length} caractères`);
  });

  it("ajoute les corrections aux consignes, en quantité limitée", () => {
    assert.match(listeningRules([]), /ne devine pas/);
    assert.doesNotMatch(listeningRules([]), /souvent mal entendus/);
    const many = Array.from({ length: CORRECTIONS_IN_PROMPT + 5 }, (_, i) => ({ heard: `mot${i}`, meant: "x" }));
    assert.equal(listeningRules(many).match(/→/g)?.length, CORRECTIONS_IN_PROMPT);
  });
});

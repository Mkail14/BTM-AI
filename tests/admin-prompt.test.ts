import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";

describe("Tamilya et son administrateur", () => {
  it("sait que l'admin l'a construite et a la page d'accueil sous les yeux", () => {
    const prompt = buildSystemPrompt(undefined, { admin: true, landingDemo: "- Tamilya : Ewa ! (Oui !)" });
    assert.match(prompt, /TON ADMINISTRATEUR/);
    assert.match(prompt, /c'est ton créateur/);
    assert.match(prompt, /Ewa ! \(Oui !\)/);
  });

  it("rien de tout ça pour un client ni en mode maître", () => {
    assert.doesNotMatch(buildSystemPrompt(undefined, { landingDemo: "x" }), /TON ADMINISTRATEUR|page d'accueil \(shimaoré/);
    assert.doesNotMatch(buildSystemPrompt(undefined, { admin: true, teacher: true }), /TON ADMINISTRATEUR/);
  });
});

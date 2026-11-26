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

describe("L'admin parle de la page d'accueil", () => {
  it("reconnu même mal écrit", async () => {
    const { mentionsLanding } = await import("@/lib/site/landing-demo-script");
    for (const text of ["la page d'accueil", "reeccris le phrases ue tu expose a la page dacceuil", "l'acueil", "la page d'entrée"]) assert.ok(mentionsLanding(text), text);
    for (const text of ["bonjour", "un recueil de poèmes", "c'est ton systeme"]) assert.ok(!mentionsLanding(text), text);
  });
});

describe("Tamilya connaît ses fonctions", () => {
  it("le bloc est donné à l'admin, jamais à un client ni en mode maître", () => {
    const systems = "TES FONCTIONS ET TES CHIFFRES (essai)";
    assert.match(buildSystemPrompt(undefined, { admin: true, adminSystems: systems }), /TES FONCTIONS ET TES CHIFFRES/);
    assert.doesNotMatch(buildSystemPrompt(undefined, { adminSystems: systems }), /TES FONCTIONS ET TES CHIFFRES/);
    assert.doesNotMatch(buildSystemPrompt(undefined, { admin: true, teacher: true, adminSystems: systems }), /TES FONCTIONS ET TES CHIFFRES/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";

describe("dossier de la personne dans le message système", () => {
  const dossier = "Réservations de l'examen du code sur BTM AI : 4 demandes depuis le 2 août 2026, dont 3 créneaux déjà passés.";

  it("donne le dossier à Tamilya avec la consigne de le remarquer avec tact", () => {
    const prompt = buildSystemPrompt(undefined, { dossier });
    assert.match(prompt, /4 demandes depuis le 2 août 2026/);
    assert.match(prompt, /demande plutôt que de supposer/);
    assert.match(prompt, /qu'une fois par conversation/);
  });

  it("ne dit rien sans dossier, ni sur un site partenaire", () => {
    assert.doesNotMatch(buildSystemPrompt(), /Dossier de la personne/);
    assert.doesNotMatch(buildSystemPrompt(undefined, { dossier, site: { intro: "Tu es {name}.", instructions: "Aide." } }), /Dossier de la personne/);
  });
});

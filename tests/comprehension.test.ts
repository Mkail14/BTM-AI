import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveIntent } from "../src/lib/live/intent";
import { cleanMessage, understand } from "../src/lib/ai/understanding";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";
import { carefulThinking } from "../src/server/services/ai/providers/gemini";

const talk = (...lines: string[]) => lines.map((content, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content }));

describe("Compréhension : fautes, abréviations, familier", () => {
  it("remet au propre les abréviations sans toucher au reste", () => {
    const { text, changes } = cleanMessage("tkt pk jveux bosser vite");
    assert.match(text, /t'inquiète pas pourquoi je veux travailler vite/);
    assert.equal(changes, 4);
  });

  it("corrige une faute de frappe sur un mot important", () => {
    assert.match(cleanMessage("je cherche un empoli à Dembéni").text, /emploi/);
    assert.match(cleanMessage("un cyclnoe arrive ?").text, /cyclone/);
    assert.match(cleanMessage("des entreprsies qui recrutent").text, /entreprises/);
  });

  it("ne change pas un message correct, ni un mot juste qui ressemble au vocabulaire", () => {
    for (const message of ["Je travaille à Mamoudzou", "des stages en alternance", "Quelle est la population de Sada ?", "une information importante"]) {
      assert.equal(cleanMessage(message).changes, 0, message);
    }
  });

  it("les quatre façons de demander du travail sont comprises comme la même demande", () => {
    for (const message of [
      "Tu peux me trouver un travail ?",
      "Cherche-moi un boulot.",
      "Je veux bosser rapidement.",
      "Y a pas des entreprises qui recrutent ?",
      "cherche moi un boulo stp",
      "jveux un taf",
    ]) {
      assert.equal(liveIntent(understand(message).cleaned).jobs, true, message);
    }
  });
});

describe("Compréhension : suites et renvois", () => {
  const jobs = talk("Tu connais des offres d'emploi à Mayotte ?", "Oui, voici quelques offres sur France Travail.");

  it("rattache « et à Dembéni ? » à la demande précédente", () => {
    const u = understand("et à Dembéni ?", jobs);
    assert.equal(u.followUp, true);
    assert.equal(liveIntent(u.retrieval).jobs, true);
    assert.match(u.block ?? "", /suite de l'échange juste au-dessus/);
    assert.equal(u.careful, true);
  });

  it("reconnaît les renvois (« celui-là », « fais pareil », « comme avant », « et maintenant ? »)", () => {
    for (const message of ["celui-là", "fais pareil pour Koungou", "comme avant mais plus court", "et maintenant ?", "le deuxième plutôt", "pareil"]) {
      assert.equal(understand(message, jobs).followUp, true, message);
    }
  });

  it("sans historique, rien à rattacher", () => {
    assert.equal(understand("et à Dembéni ?").followUp, false);
    assert.equal(understand("et à Dembéni ?").retrieval, "et à Dembéni ?");
  });

  it("une salutation ou un merci n'est pas une suite", () => {
    for (const message of ["merci", "ok", "Bonjour", "oui", "ça va ?"]) {
      const u = understand(message, jobs);
      assert.equal(u.followUp, false, message);
      assert.equal(u.careful, false, message);
    }
  });

  it("un message long et clair n'est pas une suite et reste rapide", () => {
    const u = understand("Je voudrais monter un petit snack à Mamoudzou, quel budget prévoir pour démarrer ?", jobs);
    assert.equal(u.followUp, false);
    assert.equal(u.block, null);
  });

  it("garde un message resté sans réponse après une panne", () => {
    const history = [...jobs, { role: "user" as const, content: "j'habite à Chirongui" }];
    const u = understand("alors ?", history);
    assert.deepEqual(u.unanswered, ["j'habite à Chirongui"]);
    assert.match(u.block ?? "", /Chirongui/);
  });

  it("une conversation à jour n'a rien de sans réponse", () => {
    assert.deepEqual(understand("et à Dembéni ?", jobs).unanswered, []);
  });
});

describe("Compréhension : consignes et réflexion", () => {
  it("le prompt demande de comprendre avant de répondre, et porte la lecture du message", () => {
    const u = understand("et à Dembéni ?", talk("Des offres d'emploi ?", "Oui."));
    const prompt = buildSystemPrompt(undefined, { understanding: u.block });
    assert.match(prompt, /c'est à toi de comprendre la personne/);
    assert.match(prompt, /suite de l'échange juste au-dessus/);
  });

  it("le mode maître (shimaoré) et les sites partenaires n'ont pas ces consignes", () => {
    assert.doesNotMatch(buildSystemPrompt(undefined, { teacher: true }), /c'est à toi de comprendre la personne/);
    assert.doesNotMatch(buildSystemPrompt(undefined, { site: { intro: "Tu es {name}.", instructions: "x" } }), /c'est à toi de comprendre la personne/);
  });

  it("réflexion légère : Gemini 3 en « low », Gemini 2 avec un petit budget", () => {
    assert.deepEqual(carefulThinking("gemini-3.8-flash"), [{ thinkingLevel: "low" }]);
    assert.deepEqual(carefulThinking("gemini-2.5-flash"), [{ thinkingBudget: 1024 }]);
    assert.deepEqual(carefulThinking("gemini-2.5-pro"), []);
  });
});

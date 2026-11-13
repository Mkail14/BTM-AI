import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tamilyaAge, isTamilyaBirthday } from "@/lib/ai/tamilya-identity";
import { isChallenge } from "@/lib/ai/depth";
import { buildMemoryRequest, shouldLearnFrom } from "@/lib/ai/memory";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";

describe("Âge de Tamilya", () => {
  it("compte depuis le 9 juillet 2026, à l'heure de Mayotte", () => {
    assert.equal(tamilyaAge(new Date("2026-11-06T09:00:00Z")), "3 mois");
    assert.equal(tamilyaAge(new Date("2026-11-08T21:30:00Z")), "4 mois");
    assert.equal(tamilyaAge(new Date("2027-07-09T09:00:00Z")), "1 an");
  });

  it("connaît son anniversaire, pas le jour de sa naissance", () => {
    assert.equal(isTamilyaBirthday(new Date("2026-07-09T09:00:00Z")), false);
    assert.equal(isTamilyaBirthday(new Date("2027-07-09T09:00:00Z")), true);
    assert.equal(isTamilyaBirthday(new Date("2027-07-10T09:00:00Z")), false);
  });

  it("se rappelle sa date de naissance et son âge en toute fin de consignes", () => {
    const last = buildSystemPrompt().split("\n\n").at(-1) ?? "";
    assert.match(last, /née le 9 juillet 2026/);
    assert.match(last, new RegExp(`tu as ${tamilyaAge(new Date())}`));
  });
});

describe("Remise en question", () => {
  it("reconnaît une réponse contestée, même très courte", () => {
    for (const m of ["c'est faux", "Tu te trompes", "t’es sûre ?", "tu t'es trompée", "Non, ce n'est pas ça", "je suis pas d'accord", "cest faux"]) {
      assert.equal(isChallenge(m), true, m);
    }
  });

  it("ne confond pas avec un message ordinaire", () => {
    for (const m of ["Merci", "ok c'est bon", "je suis sûre de venir demain", "fausse note", "tu peux m'aider ?"]) {
      assert.equal(isChallenge(m), false, m);
    }
  });

  it("demande de vérifier sans céder, seulement pour ce message", () => {
    assert.match(buildSystemPrompt("professionnelle", { challenged: true }), /Ne cède pas pour lui faire plaisir/);
    assert.doesNotMatch(buildSystemPrompt(), /POUR CE MESSAGE : la personne conteste/);
  });

  it("ne s'applique ni au mode maître ni aux sites partenaires", () => {
    const site = { intro: "Tu es {name}.", instructions: "Aide." };
    for (const prompt of [buildSystemPrompt("professionnelle", { teacher: true, challenged: true }), buildSystemPrompt("professionnelle", { site })]) {
      assert.doesNotMatch(prompt, /Remise en question|Proximité :|la personne conteste/);
    }
  });

  it("garde la règle d'honnêteté à côté de la proximité", () => {
    const prompt = buildSystemPrompt();
    assert.match(prompt, /Proximité :/);
    assert.match(prompt, /tu réponds clairement que tu es une intelligence artificielle/);
  });
});

describe("Souvenirs", () => {
  it("donne la date du souvenir à Tamilya", () => {
    const prompt = buildSystemPrompt("professionnelle", { memories: [{ kind: "projet", content: "Prépare son code", since: "2026-11-03T08:00:00Z" }] });
    assert.match(prompt, /Prépare son code \(noté le 3 novembre 2026\)/);
  });

  it("n'écrit pas de date quand elle est absente ou illisible", () => {
    const prompt = buildSystemPrompt("professionnelle", { memories: [{ kind: "a", content: "Sans date" }, { kind: "b", content: "Mauvaise", since: "oups" }] });
    assert.doesNotMatch(prompt, /noté le/);
  });

  it("donne la date du jour pour transformer « demain » en vraie date", () => {
    const request = buildMemoryRequest([], null, "je passe mon code demain", new Date("2026-11-06T09:00:00Z"));
    assert.match(request, /vendredi 6 novembre 2026/);
  });

  it("apprend aussi d'une correction sans « je »", () => {
    assert.equal(shouldLearnFrom("non, le marché est le dimanche"), true);
    assert.equal(shouldLearnFrom("Tu te trompes sur la date"), true);
  });
});

describe("Une seule Tamilya, à l'écrit comme à la voix", () => {
  it("garde le même caractère et la même conversation dans les deux modes", () => {
    const written = buildSystemPrompt();
    const spoken = buildSystemPrompt(undefined, { voice: true });
    for (const prompt of [written, spoken]) {
      assert.match(prompt, /Une seule Tamilya/);
      assert.match(prompt, /Ton caractère/);
      assert.match(prompt, /ne dis jamais le contraire/);
    }
    // Seule la forme change : le bouton Écouter ne concerne que l'écrit.
    assert.match(written, /bouton Écouter/);
    assert.doesNotMatch(spoken, /bouton Écouter/);
  });
});

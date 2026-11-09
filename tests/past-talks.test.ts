import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPastTalks, openingOf, withRecentReplies } from "../src/lib/ai/past-talks";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";

describe("anciennes discussions", () => {
  const conversations = [
    { id: "a", title: "Permis de conduire", updated_at: "2026-11-07T10:00:00Z" },
    { id: "b", title: "Vide", updated_at: "2026-11-06T10:00:00Z" },
  ];
  const messages = [
    { conversation_id: "a", role: "assistant", content: "Jéjé ! Le code, c'est mardi. Bonne chance.", created_at: "4" },
    { conversation_id: "a", role: "user", content: "et le code c'est quand ?", created_at: "3" },
    { conversation_id: "a", role: "assistant", content: "Jéjé ! Tu veux ton permis ?", created_at: "2" },
    { conversation_id: "a", role: "user", content: "je veux passer le permis", created_at: "1" },
  ];

  it("garde ce que la personne disait, dans l'ordre, et ses débuts de réponse", () => {
    const past = buildPastTalks(conversations, messages);
    assert.deepEqual(past.talks, [
      { title: "Permis de conduire", updatedAt: "2026-11-07T10:00:00Z", said: ["je veux passer le permis", "et le code c'est quand ?"] },
    ]);
    assert.deepEqual(past.openings, ["Jéjé !"]);
  });

  it("met en tête les débuts de la conversation en cours", () => {
    const past = withRecentReplies(buildPastTalks(conversations, messages), ["Kwezi ! Ça roule ?"]);
    assert.equal(past.openings[0], "Kwezi !");
  });

  it("ignore les blocs techniques au début d'une réponse", () => {
    assert.equal(openingOf("```lecture-3d\nhistoire\n```\nMets tes écouteurs. Ça commence."), "Mets tes écouteurs.");
  });

  it("les donne à Tamilya avec la consigne de ne pas les redire", () => {
    const system = buildSystemPrompt(undefined, { pastTalks: buildPastTalks(conversations, messages) });
    assert.ok(system.includes("« Permis de conduire »"));
    assert.ok(system.includes("Tes derniers débuts de réponse, déjà dits : « Jéjé ! »"));
    assert.ok(system.includes("Ne salue jamais deux fois de la même façon"));
  });
});

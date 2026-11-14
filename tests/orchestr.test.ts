import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toOrchestrTurns } from "@/lib/ai/orchestr";

describe("historique d'Orchestr AI", () => {
  it("réunit les messages du même côté et finit par le patron", () => {
    const turns = toOrchestrTurns([
      { role: "assistant", content: "Bonjour" },
      { role: "user", content: "un" },
      { role: "user", content: "deux" },
      { role: "assistant", content: "réponse" },
      { role: "user", content: "trois" },
      { role: "assistant", content: "en trop" },
    ]);
    assert.deepEqual(turns, [
      { role: "user", content: "un\n\ndeux" },
      { role: "assistant", content: "réponse" },
      { role: "user", content: "trois" },
    ]);
  });

  it("ne coupe pas un long message ni un long historique", () => {
    const long = "a".repeat(50_000);
    const history = Array.from({ length: 6 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: long }));
    const turns = toOrchestrTurns([...history, { role: "user", content: "fin" }]);
    assert.equal(turns.length, 7);
    assert.equal(turns[0].content.length, 50_000);
  });

  it("au-delà du budget, garde les échanges les plus récents", () => {
    const turns = toOrchestrTurns(
      [
        { role: "user", content: "ancien message" },
        { role: "assistant", content: "ancienne réponse" },
        { role: "user", content: "récent" },
      ],
      10,
    );
    assert.deepEqual(turns, [{ role: "user", content: "récent" }]);
    assert.deepEqual(toOrchestrTurns([{ role: "user", content: "0123456789abc" }], 10), [{ role: "user", content: "3456789abc" }]);
  });
});

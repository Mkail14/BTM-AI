import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rankLiveModels } from "@/lib/voice-live/models";
import { readLiveTicket, signLiveTicket } from "@/lib/voice-live/ticket";

describe("vocal en direct", () => {
  it("ticket : accepté signé et à l'heure, refusé sinon", () => {
    const ticket = signLiveTicket({ id: "u1", isAdmin: true }, "secret", 1_000);
    assert.equal(readLiveTicket(ticket, "secret", 2_000)?.uid, "u1");
    assert.equal(readLiveTicket(ticket, "secret", 2_000)?.admin, true);
    assert.equal(readLiveTicket(ticket, "autre", 2_000), null);
    assert.equal(readLiveTicket(ticket, "secret", 70_000), null);
    const [payload, signature] = ticket.split(".");
    const forged = Buffer.from(JSON.stringify({ sid: "x", uid: "u2", admin: true, exp: 9e15 })).toString("base64url");
    assert.equal(readLiveTicket(`${forged}.${signature}`, "secret", 2_000), null);
    assert.ok(payload);
  });

  it("choisit un modèle qui parle en direct, voix native d'abord", () => {
    const ranked = rankLiveModels([
      { name: "gemini-3.8-flash", methods: ["generateContent"] },
      { name: "gemini-omni-flash-preview", methods: ["generateContent", "bidiGenerateContent"] },
      { name: "gemini-3.5-flash-native-audio", methods: ["bidiGenerateContent"] },
      { name: "gemini-3.0-flash-live", methods: ["bidiGenerateContent"] },
    ]);
    assert.deepEqual(ranked, ["gemini-3.5-flash-native-audio", "gemini-3.0-flash-live", "gemini-omni-flash-preview"]);
  });
});

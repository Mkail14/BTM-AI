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

describe("boutons du vocal en direct", () => {
  it("affiche le même tableau qu'à l'écrit, selon les droits du compte", async () => {
    const { liveToolBlock, liveToolDeclarations } = await import("@/lib/voice-live/tools");
    const code = liveToolBlock("reserver_code", { bureau: "Mamoudzou", jour: "" }, { food: false, barge: false });
    assert.ok(code?.startsWith("```creneaux-code\nMamoudzou"));
    assert.ok(liveToolBlock("devis_btm", { demande: "un mur" }, { food: false, barge: false })?.includes("```"));
    // Repas et barge : seulement si le compte y a droit.
    assert.equal(liveToolBlock("commander_repas", { demande: "un mabawa" }, { food: false, barge: false }), null);
    assert.ok(liveToolBlock("commander_repas", { demande: "un mabawa" }, { food: true, barge: false })?.startsWith("```commande-repas"));
    assert.equal(liveToolBlock("inconnu", {}, { food: true, barge: true }), null);
    const names = liveToolDeclarations({ food: false, barge: false }).map((d) => d.name);
    assert.deepEqual(names, ["reserver_code", "devis_btm", "attestation_hebergement", "tableau_combine", "heure_mayotte", "bruit_ambiant", "infos_mayotte", "itineraire", "carte_cyclones", "videos_youtube", "defiler_conversation", "autoriser_paiement", "saisir_code", "annuler_paiement", "lire_tableau", "toucher_tableau", "remplir_tableau"]);
  });
});

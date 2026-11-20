import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { geminiBudgetEur, geminiCostEur } from "../src/server/services/ai/usage";

describe("crédit Google", () => {
  it("estime le coût Gemini selon la famille de modèle", () => {
    // 1 M de jetons envoyés + 1 M reçus en flash : (0,50 + 3) $ ≈ 3,22 €.
    assert.equal(Math.round(geminiCostEur("gemini-3.8-flash", 1_000_000, 1_000_000) * 100) / 100, 3.22);
    assert.ok(geminiCostEur("gemini-3.8-flash-lite", 1_000_000, 0) < geminiCostEur("gemini-3.8-flash", 1_000_000, 0));
    assert.equal(geminiCostEur("nvidia/nemotron-3.5-super-vl:free", 1_000_000, 1_000_000), 0);
  });

  it("budget de 25 € par défaut, réglable", () => {
    assert.equal(geminiBudgetEur({}), 25);
    assert.equal(geminiBudgetEur({ GEMINI_BUDGET_EUR: "40" }), 40);
    assert.equal(geminiBudgetEur({ GEMINI_BUDGET_EUR: "abc" }), 25);
  });
});

describe("jauge : la voix est comptée (2026-11-20)", () => {
  it("le son du vocal en direct coûte bien plus que son texte", () => {
    const son = geminiCostEur("gemini-2.5-flash-native-audio-latest:son", 1_000_000, 1_000_000);
    const texte = geminiCostEur("gemini-2.5-flash-native-audio-latest:texte", 1_000_000, 1_000_000);
    assert.equal(Math.round(son * 100) / 100, 13.8);
    assert.ok(son > 5 * texte);
  });
  it("la voix lue (tts) a son propre tarif, pro plus cher que flash", () => {
    assert.ok(geminiCostEur("gemini-2.5-flash-preview-tts", 0, 1_000_000) > geminiCostEur("gemini-3.8-flash", 0, 1_000_000));
    assert.ok(geminiCostEur("gemini-2.5-pro-preview-tts", 0, 1_000_000) > geminiCostEur("gemini-2.5-flash-preview-tts", 0, 1_000_000));
  });
  it("le rapport du relais n'est accepté que signé", async () => {
    process.env.LIVE_TICKET_SECRET = "secret-de-test";
    const { POST } = await import("../src/server/controllers/voice/live-usage.controller");
    const { signLiveTicket } = await import("../src/server/services/voice-live/ticket");
    const call = (report: string) => POST(new Request("http://x/api/voice/live/usage", { method: "POST", body: JSON.stringify({ report }) }) as never);
    assert.equal((await call("faux.rapport")).status, 401);
    const signed = signLiveTicket({ id: "relais", isAdmin: false }, "secret-de-test");
    assert.equal((await call(signed)).status, 200);
  });
});

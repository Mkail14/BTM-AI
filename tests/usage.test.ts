import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { geminiBudgetEur, geminiCostEur } from "@/lib/ai/usage";

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

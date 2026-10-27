import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readAIChain, readAIConfig } from "@/lib/ai/config";
import { createFallbackProvider } from "@/lib/ai/fallback";
import {
  deriveModelStatus,
  freeDailyQuota,
  getHealth,
  recordFailure,
  recordSuccess,
  requestsToday,
  type AIHealth,
} from "@/lib/ai/health";
import { errorFromStatus } from "@/lib/ai/providers/openai-compatible";
import { AIProviderError, type AIProvider, type AIStreamChunk } from "@/lib/ai/types";

const primary = {
  AI_PROVIDER: "openai-compatible",
  AI_API_KEY: "k1",
  AI_MODEL: "m1",
  AI_BASE_URL: "https://openrouter.ai/api/v1",
};

describe("readAIChain", () => {
  it("ne liste que l'API principale sans variable de secours", () => {
    const chain = readAIChain(primary);
    assert.equal(chain.length, 1);
    assert.equal(chain[0].label, "OpenRouter");
  });

  it("fait hériter une clé de secours du fournisseur et du modèle principaux", () => {
    const chain = readAIChain({ ...primary, AI_2_API_KEY: "k2" });
    assert.equal(chain.length, 2);
    const second = chain[1].result;
    assert.ok(second.ok);
    if (second.ok) {
      assert.equal(second.config.apiKey, "k2");
      assert.equal(second.config.model, "m1");
      assert.equal(second.config.baseUrl, primary.AI_BASE_URL);
    }
  });

  it("ne reprend ni modèle ni adresse quand le fournisseur change", () => {
    const result = readAIConfig({ ...primary, AI_3_PROVIDER: "anthropic", AI_3_API_KEY: "k3" }, "AI_3_");
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.config.model, "claude-opus-5-5");
      assert.equal(result.config.baseUrl, undefined);
    }
  });

  it("signale une API de secours sans clé", () => {
    const chain = readAIChain({ ...primary, AI_2_MODEL: "autre" });
    assert.equal(chain[1].result.ok, false);
    if (!chain[1].result.ok) assert.match(chain[1].result.reason, /AI_2_API_KEY/);
  });
});

describe("errorFromStatus", () => {
  it("distingue un quota épuisé d'une limite de débit", () => {
    assert.equal(errorFromStatus(402).code, "quota");
    assert.equal(errorFromStatus(429, '{"error":{"message":"Rate limit exceeded: free-models-per-day"}}').code, "quota");
    assert.equal(errorFromStatus(429, "slow down").code, "rate_limited");
    assert.equal(errorFromStatus(401).code, "auth");
  });
});

function fakeProvider(id: string, behavior: "ok" | AIProviderError, text = "bonjour"): AIProvider {
  return {
    id,
    async *stream(): AsyncIterable<AIStreamChunk> {
      if (behavior !== "ok") throw behavior;
      yield { type: "text", text };
      yield { type: "finish", reason: "stop" };
    },
  };
}

async function collect(provider: AIProvider) {
  let text = "";
  for await (const chunk of provider.stream({ system: "", messages: [], maxOutputTokens: 10, signal: new AbortController().signal })) {
    if (chunk.type === "text") text += chunk.text;
  }
  return text;
}

describe("createFallbackProvider", () => {
  it("passe à l'API suivante quand la première est épuisée", async () => {
    const provider = createFallbackProvider([
      { healthId: "t1-a", provider: fakeProvider("a", new AIProviderError("quota", "épuisé")) },
      { healthId: "t1-b", provider: fakeProvider("b", "ok", "relais") },
    ]);
    assert.equal(await collect(provider), "relais");
    assert.equal(getHealth("t1-a").lastFailure?.code, "quota");
    assert.equal(getHealth("t1-b").successes, 1);
  });

  it("essaie en dernier une API épuisée récemment", async () => {
    recordFailure("t2-a", "quota", "épuisé");
    const calls: string[] = [];
    const tracking = (id: string): AIProvider => ({
      id,
      async *stream() {
        calls.push(id);
        yield { type: "finish", reason: "stop" } as const;
      },
    });
    await collect(createFallbackProvider([
      { healthId: "t2-a", provider: tracking("a") },
      { healthId: "t2-b", provider: tracking("b") },
    ]));
    assert.deepEqual(calls, ["b"]);
  });

  it("renvoie la dernière erreur quand toutes échouent", async () => {
    const provider = createFallbackProvider([
      { healthId: "t3-a", provider: fakeProvider("a", new AIProviderError("auth", "clé")) },
      { healthId: "t3-b", provider: fakeProvider("b", new AIProviderError("quota", "épuisé")) },
    ]);
    await assert.rejects(collect(provider), (error: AIProviderError) => error.code === "quota");
  });
});

describe("deriveModelStatus", () => {
  const empty: AIHealth = {
    successes: 0,
    failures: 0,
    lastSuccessAt: null,
    lastLatencyMs: null,
    lastFailure: null,
    today: { day: "", requests: 0 },
  };
  const now = 1_000_000_000;

  it("affiche épuisée après un quota dépassé, même si la clé est acceptée", () => {
    const health = { ...empty, failures: 1, lastFailure: { code: "quota" as const, message: "x", at: now - 1000 } };
    assert.equal(deriveModelStatus({ configProblem: null, keyCheck: { ok: true }, health, now }).status, "exhausted");
  });

  it("redevient fonctionnelle après une réussite plus récente", () => {
    recordFailure("t4", "quota", "x", now - 2000);
    recordSuccess("t4", 500, now - 1000);
    assert.equal(deriveModelStatus({ configProblem: null, keyCheck: null, health: getHealth("t4"), now }).status, "ok");
  });

  it("repère un crédit OpenRouter à zéro et une clé refusée", () => {
    const credit = { usage: 5, usageDaily: null, limit: 5, remaining: 0, limitReset: null, freeTier: false };
    assert.equal(deriveModelStatus({ configProblem: null, keyCheck: { ok: true, credit }, health: empty, now }).status, "exhausted");
    assert.equal(
      deriveModelStatus({ configProblem: null, keyCheck: { ok: false, code: "auth", message: "401" }, health: empty, now }).status,
      "error",
    );
  });

  it("marque une API mal configurée comme coupée", () => {
    assert.equal(deriveModelStatus({ configProblem: "AI_2_API_KEY", keyCheck: null, health: empty, now }).status, "off");
  });
});

describe("quota gratuit OpenRouter", () => {
  const base = { baseUrl: "https://openrouter.ai/api/v1", model: "vendor/model:free", usedToday: 12, exhausted: false };

  it("compte les requêtes du jour et repart à zéro le lendemain", () => {
    const day1 = Date.UTC(2026, 9, 27, 10);
    recordSuccess("t5", 100, day1);
    recordSuccess("t5", 100, day1 + 1000);
    assert.equal(requestsToday(getHealth("t5"), day1 + 2000), 2);
    assert.equal(requestsToday(getHealth("t5"), Date.UTC(2026, 9, 28, 1)), 0);
  });

  it("applique 50 requêtes par jour sans crédit acheté, 1 000 sinon", () => {
    assert.deepEqual(freeDailyQuota({ ...base, freeTier: true }), { limit: 50, used: 12, remaining: 38 });
    assert.equal(freeDailyQuota({ ...base, freeTier: false })?.limit, 1000);
  });

  it("met le restant à zéro quand OpenRouter refuse pour quota", () => {
    assert.equal(freeDailyQuota({ ...base, freeTier: true, exhausted: true })?.remaining, 0);
  });

  it("ne s'applique qu'aux modèles gratuits d'OpenRouter", () => {
    assert.equal(freeDailyQuota({ ...base, model: "vendor/model", freeTier: true }), null);
    assert.equal(freeDailyQuota({ ...base, baseUrl: "https://api.groq.com/openai/v1", freeTier: true }), null);
  });
});

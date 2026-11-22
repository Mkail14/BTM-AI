import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createFallbackProvider, type ChainEntry } from "@/lib/ai/fallback";
import type { AIHealth } from "@/lib/ai/health";
import { laneOf, planRoute } from "@/lib/ai/switch";
import { AIProviderError, type AIProvider, type AIStreamChunk } from "@/lib/ai/types";

const NOW = 1_000_000_000;

function health(over: Partial<AIHealth> = {}): AIHealth {
  return {
    successes: 0,
    failures: 0,
    lastSuccessAt: null,
    lastLatencyMs: null,
    latencies: [],
    firstWords: [],
    lastFailure: null,
    today: { day: "", requests: 0 },
    ...over,
  };
}

describe("aiguillage : file de chaque API", () => {
  it("met en pause une API dont l'échec partagé est récent, même sur un serveur neuf", () => {
    assert.equal(laneOf(health(), { state: "limit", at: NOW - 10_000 }, NOW), "paused");
    assert.equal(laneOf(health(), { state: "empty", at: NOW - 60_000 }, NOW), "paused");
  });

  it("la passe à retester quand la pause est finie", () => {
    assert.equal(laneOf(health(), { state: "limit", at: NOW - 120_000 }, NOW), "retest");
  });

  it("une réussite plus récente l'emporte sur un vieil échec partagé", () => {
    assert.equal(laneOf(health({ lastSuccessAt: NOW - 1_000 }), { state: "limit", at: NOW - 5_000 }, NOW), "ready");
  });

  it("une réussite vue par un autre serveur remet l'API en service", () => {
    const failed = health({ lastFailure: { code: "bad_request", message: "x", at: NOW - 60_000 } });
    assert.equal(laneOf(failed, { state: "ok", at: NOW - 1_000 }, NOW), "ready");
  });

  it("met en pause une API qui ne répond pas", () => {
    const silent = health({ lastFailure: { code: "timeout", message: "x", at: NOW - 5_000 } });
    assert.equal(laneOf(silent, undefined, NOW), "paused");
  });
});

describe("aiguillage : ordre d'essai", () => {
  const a = { healthId: "a", slotId: "a" };
  const b = { healthId: "b", slotId: "b" };
  const c = { healthId: "c", slotId: "c" };

  it("envoie direct à l'API qui marche, les autres après", () => {
    const route = planRoute([a, b, c], {
      now: NOW,
      health: () => health(),
      shared: (id) => (id === "a" ? { state: "empty", at: NOW - 1_000 } : id === "b" ? { state: "limit", at: NOW - 600_000 } : undefined),
    });
    assert.deepEqual(route.order.map((e) => e.healthId), ["c", "b", "a"]);
    assert.deepEqual(route.retest.map((e) => e.healthId), ["b"]);
  });

  it("préfère la plus rapide seulement si elle gagne au moins une seconde", () => {
    const speeds: Record<string, number[]> = { a: [2_400], b: [800], c: [2_100] };
    const route = planRoute([a, b, c], { now: NOW, health: (id) => health({ firstWords: speeds[id] }) });
    assert.deepEqual(route.order.map((e) => e.healthId), ["b", "a", "c"]);
  });

  it("ne lance aucun retest de fond quand aucune API n'est prête", () => {
    const route = planRoute([a], { now: NOW, health: () => health(), shared: () => ({ state: "limit", at: NOW - 600_000 }) });
    assert.deepEqual(route.retest, []);
    assert.deepEqual(route.order, [a]);
  });
});

function fake(id: string, behavior: "ok" | "quota"): AIProvider & { calls: number } {
  const provider = {
    id,
    calls: 0,
    async *stream(): AsyncIterable<AIStreamChunk> {
      provider.calls++;
      if (behavior === "quota") throw new AIProviderError("quota", "épuisé");
      yield { type: "text", text: id };
      yield { type: "finish", reason: "stop" };
    },
  };
  return provider;
}

describe("aiguillage dans la chaîne", () => {
  it("n'essaie pas une API morte d'après les autres serveurs, et la fait retester en fond", async () => {
    const dead = fake("dead", "quota");
    const alive = fake("alive", "ok");
    const retested: string[] = [];
    const chain = createFallbackProvider(
      [
        { healthId: "switch-dead", slotId: "dead", provider: dead },
        { healthId: "switch-alive", slotId: "alive", provider: alive },
      ],
      {
        shared: (id) => (id === "dead" ? { state: "down", at: Date.now() - 120_000 } : undefined),
        retest: (entries: ChainEntry[]) => retested.push(...entries.map((e) => e.healthId)),
      },
    );
    let text = "";
    for await (const chunk of chain.stream({ system: "", messages: [], maxOutputTokens: 10, signal: new AbortController().signal })) {
      if (chunk.type === "text") text += chunk.text;
    }
    assert.equal(text, "alive");
    assert.equal(dead.calls, 0);
    assert.deepEqual(retested, ["switch-dead"]);
  });
});

function slow(id: string, delayMs: number, onAbort?: () => void): AIProvider & { calls: number } {
  const provider = {
    id,
    calls: 0,
    async *stream({ signal }: { signal: AbortSignal }): AsyncIterable<AIStreamChunk> {
      provider.calls++;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delayMs);
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          onAbort?.();
          reject(new AIProviderError("aborted", "annulé"));
        });
      });
      yield { type: "text", text: id };
      yield { type: "finish", reason: "stop" };
    },
  };
  return provider;
}

async function read(provider: AIProvider, input: Partial<Parameters<AIProvider["stream"]>[0]> = {}) {
  let text = "";
  for await (const chunk of provider.stream({ system: "", messages: [], maxOutputTokens: 10, signal: new AbortController().signal, ...input })) {
    if (chunk.type === "text") text += chunk.text;
  }
  return text;
}

describe("course entre deux API", () => {
  it("lance la seconde API quand la première tarde, garde la plus rapide et coupe l'autre", async () => {
    let aborted = 0;
    const lazy = slow("lente", 400, () => aborted++);
    const quick = slow("rapide", 20);
    const chain = createFallbackProvider(
      [
        { healthId: "race-lazy", slotId: "race-lazy", provider: lazy },
        { healthId: "race-quick", slotId: "race-quick", provider: quick },
      ],
      { hedgeMs: () => 50 },
    );
    const startedAt = Date.now();
    assert.equal(await read(chain), "rapide");
    assert.ok(Date.now() - startedAt < 300);
    assert.equal(aborted, 1);
  });

  it("ne lance pas de seconde API si la première répond à temps", async () => {
    const first = slow("premiere", 10);
    const second = slow("seconde", 10);
    const chain = createFallbackProvider(
      [
        { healthId: "race-first", provider: first },
        { healthId: "race-second", provider: second },
      ],
      { hedgeMs: () => 200 },
    );
    assert.equal(await read(chain), "premiere");
    assert.equal(second.calls, 0);
  });

  it("pas de course pour une réflexion approfondie", async () => {
    const first = slow("pensive", 120);
    const second = slow("autre", 10);
    const chain = createFallbackProvider([
      { healthId: "race-deep-1", provider: first },
      { healthId: "race-deep-2", provider: second },
    ]);
    assert.equal(await read(chain, { deep: true }), "pensive");
    assert.equal(second.calls, 0);
  });

  it("passe à l'API suivante si la première échoue pendant la course", async () => {
    const broken = fake("cassee", "quota");
    const good = slow("bonne", 10);
    const chain = createFallbackProvider(
      [
        { healthId: "race-broken", provider: broken },
        { healthId: "race-good", provider: good },
      ],
      { hedgeMs: () => 1_000 },
    );
    assert.equal(await read(chain), "bonne");
  });
});

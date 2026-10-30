import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { flowCutStop, isCuttableBlock } from "@/lib/ai/flow-cuts";

describe("flowCutStop", () => {
  it("laisse passer les messages quand rien n'est coupé", () => {
    assert.equal(flowCutStop(new Set()), null);
  });

  it("arrête les messages au premier lien coupé du trajet", () => {
    assert.equal(flowCutStop(new Set(["knowledge"])), "knowledge");
    assert.equal(flowCutStop(new Set(["memory", "input"])), "input");
  });

  it("laisse passer quand seule une API est coupée (les autres prennent le relais)", () => {
    assert.equal(flowCutStop(new Set(["env-2", "db-c29a4757-552a-419b-a78f-3e67e5968472"])), null);
  });
});

describe("isCuttableBlock", () => {
  it("accepte les blocs du schéma et les API, refuse le reste", () => {
    for (const id of ["input", "lexicon", "env-1", "db-c29a4757-552a-419b-a78f-3e67e5968472"]) assert.ok(isCuttableBlock(id), id);
    for (const id of ["guard", "output", "db-pas-un-uuid", 3, null]) assert.ok(!isCuttableBlock(id), String(id));
  });
});

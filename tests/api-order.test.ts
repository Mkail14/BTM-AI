import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSlotId, sortByChosenOrder } from "../src/server/services/ai/registry";

const chain = [{ id: "env-1" }, { id: "env-2" }, { id: "db-11111111-1111-4111-8111-111111111111" }];
const ids = (slots: { id: string }[]) => slots.map((s) => s.id);

describe("Circuit : ordre des API choisi en glissant les blocs", () => {
  it("garde l'ordre habituel sans ordre choisi", () => {
    assert.deepEqual(ids(sortByChosenOrder(chain, [])), ["env-1", "env-2", "db-11111111-1111-4111-8111-111111111111"]);
  });

  it("met l'API choisie en premier, les autres suivent", () => {
    const order = ["db-11111111-1111-4111-8111-111111111111", "env-1", "env-2"];
    assert.deepEqual(ids(sortByChosenOrder(chain, order)), order);
  });

  it("range après les autres une API absente de l'ordre (ajoutée depuis)", () => {
    assert.deepEqual(ids(sortByChosenOrder(chain, ["env-2", "env-1"])), ["env-2", "env-1", "db-11111111-1111-4111-8111-111111111111"]);
  });

  it("ignore une API de l'ordre qui n'existe plus", () => {
    assert.deepEqual(ids(sortByChosenOrder(chain, ["env-9", "env-2"])), ["env-2", "env-1", "db-11111111-1111-4111-8111-111111111111"]);
  });

  it("n'accepte que des identifiants d'API", () => {
    assert.equal(isSlotId("env-3"), true);
    assert.equal(isSlotId("db-11111111-1111-4111-8111-111111111111"), true);
    assert.equal(isSlotId("db-pas-un-uuid"), false);
    assert.equal(isSlotId("model-env-1"), false);
    assert.equal(isSlotId(3), false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isWeakNetwork, readQuality } from "@/lib/hooks/connection-quality";

describe("qualité de la connexion", () => {
  it("repère une connexion faible", () => {
    assert.equal(isWeakNetwork({ effectiveType: "2g" }), true);
    assert.equal(isWeakNetwork({ effectiveType: "slow-2g" }), true);
    assert.equal(isWeakNetwork({ effectiveType: "4g", rtt: 1200 }), true);
    assert.equal(isWeakNetwork({ effectiveType: "3g", downlink: 0.3 }), true);
    assert.equal(isWeakNetwork({ effectiveType: "4g", rtt: 100, downlink: 10 }), false);
    assert.equal(isWeakNetwork({ effectiveType: "4g", downlink: 0 }), false);
    assert.equal(isWeakNetwork(undefined), false);
  });

  it("hors ligne passe avant la connexion faible", () => {
    assert.equal(readQuality(false, true), "offline");
    assert.equal(readQuality(true, true), "weak");
    assert.equal(readQuality(true, false), "good");
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FEATURE_IDS, featuresFor, readSwitches } from "../src/lib/site/features-rules";

describe("Fonctionnalités allumées pour tous", () => {
  it("prend les valeurs par défaut quand rien n'est enregistré, et ignore le reste", () => {
    const switches = readSwitches({ livres: true, inconnue: true, cyclone: "oui" });
    assert.deepEqual(switches, { documents: true, cyclone: true, attestation: true, signature: false, livres: true });
    assert.deepEqual(readSwitches(null), { documents: true, cyclone: true, attestation: true, signature: false, livres: false });
  });

  it("donne tout aux administrateurs, et seulement ce qui est allumé aux autres", () => {
    const switches = readSwitches({ documents: false, livres: false });
    assert.deepEqual(featuresFor({ isAdmin: true }, switches), FEATURE_IDS);
    assert.deepEqual(featuresFor({ isAdmin: false }, switches), ["cyclone", "attestation"]);
    assert.deepEqual(featuresFor(null, switches), ["cyclone", "attestation"]);
  });
});

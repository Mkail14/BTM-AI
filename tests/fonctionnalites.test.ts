import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FEATURE_IDS, featuresFor, readSwitches } from "../src/lib/site/features-rules";

describe("Fonctionnalités allumées pour tous", () => {
  // Par défaut, ce qui existait avant les interrupteurs reste comme avant : ouvert à tous ou réservé aux administrateurs.
  const DEFAULTS = {
    documents: true,
    cyclone: true,
    attestation: true,
    signature: false,
    livres: false,
    devis: true,
    trajet: true,
    code: true,
    chanson: true,
    youtube: true,
    repas: false,
    barge: false,
    portefeuille: false,
    vocal: false,
  };

  it("prend les valeurs par défaut quand rien n'est enregistré, et ignore le reste", () => {
    const switches = readSwitches({ livres: true, inconnue: true, cyclone: "oui" });
    assert.deepEqual(switches, { ...DEFAULTS, livres: true });
    assert.deepEqual(readSwitches(null), DEFAULTS);
  });

  it("donne tout aux administrateurs, et seulement ce qui est allumé aux autres", () => {
    const switches = readSwitches({ documents: false, livres: false, devis: false, trajet: false, code: false, chanson: false, youtube: false, vocal: true });
    assert.deepEqual(featuresFor({ isAdmin: true }, switches), FEATURE_IDS);
    assert.deepEqual(featuresFor({ isAdmin: false }, switches), ["cyclone", "attestation", "vocal"]);
    assert.deepEqual(featuresFor(null, switches), ["cyclone", "attestation", "vocal"]);
  });
});

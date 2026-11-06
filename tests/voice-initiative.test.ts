import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { VOICE_IDLE_LIMIT_MS } from "@/lib/voice-live/hang-up";
import { INITIATIVE_NOTE, initiativeDelayMs } from "@/lib/voice-live/initiative";

describe("Tamilya parle d'elle-même (mode admin)", () => {
  it("espace ses prises de parole puis se tait", () => {
    assert.equal(initiativeDelayMs(0), 40_000);
    assert.ok(initiativeDelayMs(1)! > initiativeDelayMs(0)!);
    assert.equal(initiativeDelayMs(3), null);
  });

  it("parle toujours avant que l'appel ne raccroche seul", () => {
    for (const attempts of [0, 1, 2]) assert.ok(initiativeDelayMs(attempts)! < VOICE_IDLE_LIMIT_MS);
  });

  it("n'agit sur rien de sa propre initiative", () => {
    assert.match(INITIATIVE_NOTE, /N'actionne aucun bouton/);
  });
});

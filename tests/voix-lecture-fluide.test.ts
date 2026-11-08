import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPlayout, fadeIn } from "../src/lib/voice-live/playout";

describe("Voix en direct : lecture des morceaux", () => {
  it("même programmation qu'avant : à la suite, ou 20 ms après l'instant présent", () => {
    const playout = createPlayout();
    assert.equal(playout.schedule(1, 0.04).startAt, 1.02);
    // Morceau arrivé en avance : joué juste après le précédent.
    assert.ok(Math.abs(playout.schedule(1.01, 0.04).startAt - 1.06) < 1e-9);
  });

  it("repère un trou (morceau arrivé après la fin du précédent) et demande un fondu", () => {
    const playout = createPlayout();
    const first = playout.schedule(0, 0.04);
    assert.equal(first.fresh, true, "début de réponse : fondu");
    assert.equal(playout.schedule(0.03, 0.04).fresh, false, "à l'heure : pas de fondu");
    const late = playout.schedule(1, 0.04);
    assert.equal(late.underrun, true);
    assert.equal(late.fresh, true);
    assert.equal(playout.underruns, 1);
  });

  it("une nouvelle réponse après reset n'est pas comptée comme un trou", () => {
    const playout = createPlayout();
    playout.schedule(0, 0.04);
    playout.reset();
    const slot = playout.schedule(5, 0.04);
    assert.equal(slot.underrun, false);
    assert.equal(slot.fresh, true);
    assert.equal(playout.underruns, 0);
  });

  it("le fondu d'entrée part de zéro et ne touche que les 4 premières ms", () => {
    const samples = new Float32Array(480).fill(1);
    fadeIn(samples, 24_000);
    assert.equal(samples[0], 0);
    assert.ok(samples[50] < 1);
    assert.equal(samples[96], 1);
    assert.equal(samples[479], 1);
  });

  it("sans fondu, le saut au départ d'un morceau est entier ; avec, il est 96 fois plus petit", () => {
    const samples = new Float32Array(480).fill(0.8);
    const before = Math.abs(samples[0] - 0);
    fadeIn(samples, 24_000);
    const steps = samples.slice(1, 100).map((v, i) => Math.abs(v - samples[i]));
    const after = Math.max(samples[0], ...steps);
    assert.ok(after * 90 < before, `${after} contre ${before}`);
  });
});

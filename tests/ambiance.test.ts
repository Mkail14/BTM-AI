import assert from "node:assert/strict";
import { test } from "node:test";
import { createAmbiance, noiseWords } from "../src/lib/voice-live/ambiance";

const packet = (amount: number) => Float32Array.from({ length: 1600 }, () => (Math.random() * 2 - 1) * amount);

test("bruit autour : rien tant qu'on n'a pas une seconde sans parole", () => {
  const ambiance = createAmbiance();
  for (let i = 0; i < 9; i++) ambiance.keep(packet(0.05));
  assert.equal(ambiance.level(), null);
  assert.equal(ambiance.wav(), null);
});

test("bruit autour : 5 s gardées au plus, en WAV 16 kHz lisible", () => {
  const ambiance = createAmbiance();
  for (let i = 0; i < 80; i++) ambiance.keep(packet(0.05));
  const wav = ambiance.wav()!;
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), "RIFF");
  const view = new DataView(wav.buffer);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(40, true), 50 * 1600 * 2, "5 s, pas plus");
});

test("bruit autour : le niveau se dit en mots", () => {
  assert.match(noiseWords(0.001), /calme/);
  assert.match(noiseWords(0.1), /beaucoup/);
  const ambiance = createAmbiance();
  for (let i = 0; i < 20; i++) ambiance.keep(packet(0.2));
  assert.match(noiseWords(ambiance.level()!), /beaucoup/);
});

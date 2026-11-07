import assert from "node:assert/strict";
import { test } from "node:test";
import { createAmbiance, describeAmbiance, noiseWords } from "../src/lib/voice-live/ambiance";

const packet = (amount: number) => Float32Array.from({ length: 1600 }, () => (Math.random() * 2 - 1) * amount);

test("bruit autour : rien tant qu'on n'a pas une seconde sans parole", () => {
  const ambiance = createAmbiance();
  for (let i = 0; i < 9; i++) ambiance.keep(packet(0.05));
  assert.equal(ambiance.level(), null);
  assert.equal(ambiance.wav(), null);
});

test("bruit autour : envoi léger, 2,5 s en WAV 8 kHz lisible (≈ 40 Ko)", () => {
  const ambiance = createAmbiance();
  for (let i = 0; i < 80; i++) ambiance.keep(packet(0.05));
  const wav = ambiance.wav()!;
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), "RIFF");
  const view = new DataView(wav.buffer);
  assert.equal(view.getUint32(24, true), 8000);
  assert.equal(view.getUint32(40, true), 25 * 800 * 2, "2,5 s, pas plus");
  assert.ok(wav.length < 45_000);
});

test("bruit autour : Tamilya n'attend jamais plus de 3 s la reconnaissance", async () => {
  const ambiance = createAmbiance();
  for (let i = 0; i < 30; i++) ambiance.keep(packet(0.05));
  const realFetch = globalThis.fetch;
  // Serveur qui ne répond jamais (connexion saturée) : seule l'annulation arrête l'attente.
  globalThis.fetch = ((_url: string, init?: RequestInit) =>
    new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("annulé"))))) as typeof fetch;
  try {
    const start = Date.now();
    const answer = await describeAmbiance(ambiance, new AbortController().signal);
    assert.ok(Date.now() - start < 3500, "répond en moins de 3,5 s");
    assert.match(answer, /Niveau du bruit/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("bruit autour : le niveau se dit en mots", () => {
  assert.match(noiseWords(0.001), /calme/);
  assert.match(noiseWords(0.1), /beaucoup/);
  const ambiance = createAmbiance();
  for (let i = 0; i < 20; i++) ambiance.keep(packet(0.2));
  assert.match(noiseWords(ambiance.level()!), /beaucoup/);
});

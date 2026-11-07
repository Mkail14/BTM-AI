import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import * as ort from "onnxruntime-web";
import { trimSilence } from "../src/lib/voice-live/record";
import { createPrinter, fbank, normalize, similarity } from "../src/lib/voice-live/speaker";
import { ACCEPT, judgeVoice, PRINT_SIZE } from "../src/lib/voice-live/voice-check";

/** Empreinte au hasard, puis une voisine (même personne) ou une sans rapport. */
const random = () => normalize(Array.from({ length: PRINT_SIZE }, () => Math.random() * 2 - 1));
const near = (base: number[], noise: number) => normalize(base.map((v) => v + (Math.random() * 2 - 1) * noise));

test("fbank : 80 bandes toutes les 10 ms, moyenne retirée", () => {
  const second = Float32Array.from({ length: 16000 }, (_, i) => Math.sin(i / 5) * 0.3);
  const { frames, data } = fbank(second);
  assert.equal(frames, 98);
  assert.equal(data.length, 98 * 80);
  for (let m = 0; m < 80; m++) {
    let mean = 0;
    for (let t = 0; t < frames; t++) mean += data[t * 80 + m];
    assert.ok(Math.abs(mean / frames) < 1e-3);
  }
});

test("même voix assez longue : acceptée", () => {
  const me = random();
  const verdict = judgeVoice(me, { parts: [{ print: near(me, 0.05), seconds: 2 }, { print: near(me, 0.05), seconds: 1.5 }] });
  assert.equal(verdict.ok, true);
  assert.ok(verdict.ok && verdict.score >= ACCEPT);
});

test("autre voix : refusée", () => {
  const verdict = judgeVoice(random(), { parts: [{ print: random(), seconds: 3 }] });
  assert.deepEqual(verdict.ok ? null : verdict.reason, "mismatch");
});

test("trop peu de voix : Tamilya demande une phrase", () => {
  const me = random();
  const verdict = judgeVoice(me, { parts: [{ print: near(me, 0.05), seconds: 1.2 }] });
  assert.deepEqual(verdict.ok ? null : verdict.reason, "short");
});

test("une phrase d'une autre personne au milieu de la mienne : refus", () => {
  const me = random();
  const verdict = judgeVoice(me, {
    parts: [
      { print: near(me, 0.05), seconds: 4 },
      { print: random(), seconds: 2 },
    ],
  });
  assert.deepEqual(verdict.ok ? null : verdict.reason, "mismatch");
});

test("empreinte de mauvaise taille : ignorée", () => {
  const me = random();
  const verdict = judgeVoice(me, { parts: [{ print: [1, 2, 3], seconds: 5 }] });
  assert.deepEqual(verdict.ok ? null : verdict.reason, "short");
});

test("silence du début et de la fin retiré", () => {
  const samples = new Float32Array(16000 * 3);
  for (let i = 16000; i < 32000; i++) samples[i] = Math.sin(i / 6) * 0.3;
  const trimmed = trimSilence(samples);
  assert.ok(trimmed.length > 16000 && trimmed.length < 16000 + 0.5 * 16000);
});

test("le modèle allégé du site rend une empreinte de 256 nombres, stable", async () => {
  ort.env.wasm.numThreads = 1;
  const printer = await createPrinter(ort, new Uint8Array(readFileSync("public/voiceprint/resnet34.onnx")));
  const sound = Float32Array.from({ length: 32000 }, (_, i) => Math.sin(i / 9) * 0.2 * Math.sin(i / 1600) + Math.sin(i / 3.3) * 0.05);
  const a = await printer(sound);
  const b = await printer(sound);
  assert.equal(a?.length, PRINT_SIZE);
  assert.ok(a && b && similarity(a, b) > 0.999);
  assert.equal(await printer(new Float32Array(8000)), null);
});

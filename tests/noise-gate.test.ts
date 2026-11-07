import assert from "node:assert/strict";
import { test } from "node:test";
import { speechDetection } from "../src/lib/voice-live/detection";
import { createNoiseGate } from "../src/lib/voice-live/noise-gate";
import { readLiveTicket, signLiveTicket } from "../src/lib/voice-live/ticket";

const SIZE = 1600;
const noise = (amount: number) => Float32Array.from({ length: SIZE }, () => (Math.random() * 2 - 1) * amount);
const voice = (amount: number, background = 0) => Float32Array.from({ length: SIZE }, (_, i) => Math.sin(i / 8) * amount + (Math.random() * 2 - 1) * background);
const silent = (packets: Float32Array[]) => packets.every((packet) => packet.every((value) => value === 0));

test("bruit de fond constant : Gemini ne reçoit que du silence", () => {
  const gate = createNoiseGate();
  for (let i = 0; i < 100; i++) assert.ok(silent(gate(noise(0.1))), `paquet ${i}`);
});

test("une voix dans le bruit passe, et le silence revient à la fin de la phrase", () => {
  const gate = createNoiseGate();
  for (let i = 0; i < 30; i++) gate(noise(0.05));
  const during = Array.from({ length: 20 }, () => gate(voice(0.3, 0.05)));
  assert.ok(during.slice(2).every((packets) => !silent(packets)), "la voix passe");
  const after = Array.from({ length: 6 }, () => gate(noise(0.05)));
  assert.ok(silent(after[after.length - 1]), "fin de phrase : du silence, même si le bruit continue");
});

test("le début de la phrase n'est pas perdu", () => {
  const gate = createNoiseGate();
  for (let i = 0; i < 20; i++) gate(noise(0.02));
  gate(voice(0.3));
  assert.equal(gate(voice(0.3)).length, 3, "le paquet d'avant et les deux premiers de la voix");
});

test("un coup isolé n'ouvre pas la porte", () => {
  const gate = createNoiseGate();
  for (let i = 0; i < 20; i++) gate(noise(0.02));
  assert.ok(silent(gate(voice(0.8))));
  assert.ok(silent(gate(noise(0.02))));
});

test("une petite pause ne coupe pas la phrase", () => {
  const gate = createNoiseGate();
  for (let i = 0; i < 20; i++) gate(noise(0.02));
  for (let i = 0; i < 5; i++) gate(voice(0.3));
  for (let i = 0; i < 5; i++) assert.ok(!silent(gate(noise(0.02))), `pause de ${i + 1}00 ms`);
  assert.ok(!silent(gate(voice(0.3))));
});

test("une longue phrase n'est pas prise pour du bruit", () => {
  const gate = createNoiseGate();
  for (let i = 0; i < 20; i++) gate(noise(0.05));
  // 8 s de parole : des syllabes fortes et des creux au niveau du bruit, comme une vraie voix.
  const packets = Array.from({ length: 80 }, (_, i) => gate(i % 5 === 4 ? noise(0.05) : voice(0.2, 0.05)));
  assert.ok(packets.slice(2).every((sent) => !silent(sent)));
});

test("dans une pièce calme, la voix passe tout de suite", () => {
  const gate = createNoiseGate();
  for (let i = 0; i < 10; i++) gate(new Float32Array(SIZE));
  gate(voice(0.1));
  assert.ok(!silent(gate(voice(0.1))));
});

test("maintenir pour parler : Gemini n'écoute plus lui-même", () => {
  assert.deepEqual(speechDetection(true), { automaticActivityDetection: { disabled: true } });
  assert.equal(speechDetection(false).automaticActivityDetection.disabled, undefined);
});

test("le mode choisi voyage dans le ticket signé", () => {
  const user = { id: "u", isAdmin: true };
  assert.equal(readLiveTicket(signLiveTicket(user, "s", Date.now(), true), "s")?.manual, true);
  assert.equal(readLiveTicket(signLiveTicket(user, "s"), "s")?.manual, false);
});

test("pendant que Tamilya parle, l'écho de sa voix ne passe pas, mais une vraie interruption si", () => {
  const gate = createNoiseGate();
  for (let i = 0; i < 20; i++) gate(new Float32Array(SIZE), true);
  for (let i = 0; i < 40; i++) assert.ok(silent(gate(voice(0.04), true)), `écho ${i}`);
  const interruption = Array.from({ length: 6 }, () => gate(voice(0.3), true));
  assert.ok(silent(interruption[1]), "pas sur un simple coup de bruit");
  assert.ok(!silent(interruption[5]), "la personne qui parle fort la coupe");
});

test("avec Silero : un bruit fort qui n'est pas une voix reste du silence", () => {
  const gate = createNoiseGate();
  for (let i = 0; i < 30; i++) gate(noise(0.01));
  // Coup de bruit très fort, mais Silero dit « pas de voix ».
  for (let i = 0; i < 10; i++) assert.ok(silent(gate(noise(0.4), false, 0.05)), `paquet ${i}`);
});

test("avec Silero : une voix passe, même à peine plus forte que le bruit, puis la porte se referme", () => {
  const gate = createNoiseGate();
  for (let i = 0; i < 30; i++) gate(noise(0.05), false, 0.02);
  const during = Array.from({ length: 10 }, () => gate(voice(0.06, 0.05), false, 0.9));
  assert.ok(during.slice(2).every((packets) => !silent(packets)), "la voix passe");
  const after = Array.from({ length: 6 }, () => gate(noise(0.05), false, 0.02));
  assert.ok(silent(after[after.length - 1]), "fin de phrase : du silence");
});

test("avec Silero : l'écho de Tamilya ne coupe pas sa voix", () => {
  const gate = createNoiseGate();
  for (let i = 0; i < 30; i++) gate(noise(0.01), false, 0.02);
  // Son écho est une voix (Silero 0,9) mais pas plus forte qu'elle.
  for (let i = 0; i < 10; i++) assert.ok(silent(gate(voice(0.04), true, 0.9)), `paquet ${i}`);
});

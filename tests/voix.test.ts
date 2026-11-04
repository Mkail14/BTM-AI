import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ttsModels } from "@/lib/ai/voice/gemini-tts";
import { isGeminiVoice } from "@/lib/ai/voice/voices";

describe("voix de Tamilya", () => {
  it("choisit les modèles de voix de la clé, flash d'abord", () => {
    assert.deepEqual(ttsModels(["gemini-2.5-pro-preview-tts", "gemini-3.6-flash", "gemini-2.5-flash-preview-tts"]), [
      "gemini-2.5-flash-preview-tts",
      "gemini-2.5-pro-preview-tts",
    ]);
    assert.ok(ttsModels([]).length > 0);
  });

  it("n'accepte que les voix connues", () => {
    assert.equal(isGeminiVoice("Leda"), true);
    assert.equal(isGeminiVoice("Inventee"), false);
  });
});

describe("voix compressée", () => {
  it("encode le son de Gemini en MP3, bien plus léger que le WAV", async () => {
    const { pcmToMp3 } = await import("@/lib/ai/voice/gemini-tts");
    const samples = new Int16Array(24_000);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.round(8000 * Math.sin((i / 24_000) * 2 * Math.PI * 220));
    const mp3 = await pcmToMp3(samples, 24_000);
    assert.ok(mp3.length > 1000 && mp3.length < 48_000 / 4, `taille ${mp3.length}`);
    assert.equal(mp3[0], 0xff);
  });
});

describe("voix sans grésillement ni attente", () => {
  it("coupe le petit bruit isolé de la fin et du début", async () => {
    const { cleanSpeech } = await import("@/lib/ai/voice/gemini-tts");
    const rate = 24_000;
    const ms = (n: number) => Math.round((rate * n) / 1000);
    const tone = (n: number) => Array.from({ length: ms(n) }, (_, i) => Math.round(6000 * Math.sin(i / 3)));
    const silence = (n: number) => new Array(ms(n)).fill(0);
    // Bruit 40 ms, silence 200 ms, parole 1 s, silence 400 ms, grésillement 150 ms.
    const samples = Int16Array.from([...tone(40), ...silence(200), ...tone(1000), ...silence(400), ...tone(150)]);
    const out = cleanSpeech(samples, rate);
    // Reste : la parole et 80 ms d'air de chaque côté.
    assert.ok(Math.abs(out.length - ms(1160)) <= ms(40), `durée ${Math.round((out.length / rate) * 1000)} ms`);
    assert.equal(out[0], 0);
  });

  it("garde un vrai mot court à la fin quand il suit de près", async () => {
    const { cleanSpeech } = await import("@/lib/ai/voice/gemini-tts");
    const rate = 24_000;
    const ms = (n: number) => Math.round((rate * n) / 1000);
    const tone = (n: number) => Array.from({ length: ms(n) }, (_, i) => Math.round(6000 * Math.sin(i / 3)));
    const samples = Int16Array.from([...tone(800), ...new Array(ms(100)).fill(0), ...tone(200)]);
    assert.ok(cleanSpeech(samples, rate).length >= ms(1100));
  });

  it("découpe la réponse : la première phrase seule, puis des morceaux", async () => {
    const { speechChunks } = await import("@/lib/chat/voice");
    const chunks = speechChunks("Oui ! Bonjour, je suis Tamilya et je suis là. Il fait beau à Mamoudzou. La barge circule. Marahaba !");
    assert.deepEqual(chunks, ["Oui ! Bonjour, je suis Tamilya et je suis là.", "Il fait beau à Mamoudzou. La barge circule. Marahaba !"]);
    assert.deepEqual(speechChunks("Sans point final"), ["Sans point final"]);
  });
});

describe("voix au fil de la réponse", () => {
  it("envoie chaque phrase dès qu'elle est terminée", async () => {
    const { createSentenceSplitter } = await import("@/lib/chat/sentences");
    const s = createSentenceSplitter();
    assert.deepEqual(s.push("Oui ! Il fait beau à Mamou"), []);
    assert.deepEqual(s.push("dzou aujourd'hui. La ba"), ["Oui ! Il fait beau à Mamoudzou aujourd'hui."]);
    assert.deepEqual(s.push("rge coûte 0.75 euro"), []);
    assert.deepEqual(s.push(" pour un piéton ! Mara"), ["La barge coûte 0.75 euro pour un piéton !"]);
    assert.deepEqual(s.end(), ["Mara"]);
    assert.deepEqual(s.end(), []);
  });
});

describe("chronométrage du vocal", () => {
  it("calcule médiane, P90 et P95", async () => {
    const { percentile } = await import("@/lib/chat/voice-metrics");
    const values = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    assert.equal(percentile(values, 50), 1000);
    assert.equal(percentile(values, 90), 1800);
    assert.equal(percentile(values, 95), 1900);
    assert.equal(percentile([], 50), null);
  });

  it("note chaque étape une seule fois, depuis la fin de la phrase", async () => {
    const { beginVoiceTurn, markVoice, markVoiceServer } = await import("@/lib/chat/voice-metrics");
    beginVoiceTurn();
    markVoice("sent");
    markVoiceServer({ ttsMs: 900 });
    markVoiceServer({ ttsMs: 2000 });
    // Sans localStorage (Node) : l'enregistrement échoue en silence, sans erreur.
    assert.doesNotThrow(() => markVoice("audioStart"));
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pcmToWav, ttsModels } from "@/lib/ai/voice/gemini-tts";
import { isGeminiVoice } from "@/lib/ai/voice/voices";

describe("voix de Tamilya", () => {
  it("emballe le son brut de Gemini dans un WAV lisible", () => {
    const wav = pcmToWav(new Uint8Array([1, 2, 3, 4]), 24_000);
    const view = new DataView(wav.buffer);
    assert.equal(new TextDecoder().decode(wav.slice(0, 4)), "RIFF");
    assert.equal(new TextDecoder().decode(wav.slice(8, 12)), "WAVE");
    assert.equal(view.getUint32(24, true), 24_000);
    assert.equal(view.getUint32(40, true), 4);
    assert.equal(wav.length, 48);
  });

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

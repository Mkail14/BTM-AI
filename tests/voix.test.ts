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
    const mp3 = await pcmToMp3(new Uint8Array(samples.buffer), 24_000);
    assert.ok(mp3.length > 1000 && mp3.length < 48_000 / 4, `taille ${mp3.length}`);
    assert.equal(mp3[0], 0xff);
  });
});

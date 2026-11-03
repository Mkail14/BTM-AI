import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getVoiceMood, voiceHeard, voiceLevel, voiceListenEnd, voiceSpeakEnd, voiceSpeakStart, voiceWord } from "@/lib/chat/voice-level";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("niveau de voix du globe de Tamilya", () => {
  it("monte sur les syllabes prononcées puis retombe", async () => {
    voiceSpeakStart("Jéjé, marahaba mana !");
    assert.equal(getVoiceMood(), "speaking");
    voiceWord("Jéjé, marahaba mana !", 0);
    await wait(60);
    const loud = voiceLevel();
    assert.ok(loud > 0.3, `niveau pendant la syllabe : ${loud}`);
    voiceSpeakEnd();
    assert.equal(getVoiceMood(), "idle");
    assert.equal(voiceLevel(), 0);
  });

  it("parle quand même si le navigateur ne signale pas les mots", async () => {
    voiceSpeakStart("Bonjour à toi, comment vas-tu aujourd'hui ?");
    await wait(450);
    let peak = 0;
    for (let i = 0; i < 12; i++) {
      peak = Math.max(peak, voiceLevel());
      await wait(25);
    }
    assert.ok(peak > 0.3, `niveau estimé : ${peak}`);
    voiceSpeakEnd();
  });

  it("frémit quand la personne parle", async () => {
    voiceHeard(12);
    assert.equal(getVoiceMood(), "listening");
    await wait(50);
    assert.ok(voiceLevel() > 0.1);
    voiceListenEnd();
    assert.equal(getVoiceMood(), "idle");
  });
});

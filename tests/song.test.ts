import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectSong, lyriaPrompt, parseSongSpec, SONG_LIMITS } from "../src/lib/music/intent";

describe("Chansons de Tamilya : demande reconnue", () => {
  it("reconnaît une demande de chanter", () => {
    for (const message of ["Chante-moi quelque chose", "tu peux chanter ?", "Fais-moi une chanson sur la barge", "écris une petite chanson pour ma fille", "invente une berceuse", "fredonne un air"]) {
      assert.equal(detectSong(message), true, message);
    }
  });

  it("ne se déclenche pas quand on parle seulement de musique", () => {
    for (const message of ["c'est quoi cette chanson ?", "j'aime le chant des oiseaux", "quel temps demain à Mamoudzou ?", "le marchand de Chanteloup"]) {
      assert.equal(detectSong(message), false, message);
    }
  });
});

describe("Chansons de Tamilya : bloc et demande à Lyria", () => {
  const block = "style: chant de rue joyeux, chœur et violons, environ 130 BPM\n[Couplet]\nSur la barge au matin\nLe lagon brille\n[Refrain]\nTamilya chante\nMayotte avec elle";

  it("sépare le style et les paroles", () => {
    const spec = parseSongSpec(block);
    assert.equal(spec?.style, "chant de rue joyeux, chœur et violons, environ 130 BPM");
    assert.match(spec?.lyrics ?? "", /^\[Couplet\]\nSur la barge au matin/);
  });

  it("accepte des paroles sans ligne de style", () => {
    assert.deepEqual(parseSongSpec("[Refrain]\nLa la la"), { style: "", lyrics: "[Refrain]\nLa la la" });
  });

  it("refuse un bloc vide ou trop long (un extrait de 30 s ne chante pas tout un album)", () => {
    assert.equal(parseSongSpec("style: pop"), null);
    assert.equal(parseSongSpec(Array.from({ length: SONG_LIMITS.lines + 1 }, (_, i) => `ligne ${i}`).join("\n")), null);
    assert.equal(parseSongSpec("a".repeat(SONG_LIMITS.lyrics + 1)), null);
  });

  it("demande à Lyria une chanson originale, avec instruments, et ces paroles exactement", () => {
    const prompt = lyriaPrompt(parseSongSpec(block)!);
    assert.match(prompt, /^Original song: chant de rue joyeux/);
    assert.match(prompt, /Do not imitate any existing song or artist/);
    assert.match(prompt, /Tamilya chante\nMayotte avec elle$/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectSong, lyriaPrompt, parseSongSpec, SONG_LIMITS, voiceSongSpec } from "../src/lib/music/intent";
import { fadeAt, ORBIT, orbitAt, SONG_FADE } from "../src/lib/music/song-space";

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
    assert.match(prompt, /real human singer/);
    assert.match(prompt, /Never stop abruptly/);
    assert.match(prompt, /Tamilya chante\nMayotte avec elle$/);
  });
});

describe("Chansons de Tamilya : en vocal (bouton chanter)", () => {
  it("fait le bloc à partir du style et des paroles", () => {
    const spec = voiceSongSpec("reggae joyeux", "[Couplet]\nSur la barge\n[Refrain]\nMayotte");
    assert.equal(spec, "style: reggae joyeux\n[Couplet]\nSur la barge\n[Refrain]\nMayotte");
    assert.deepEqual(parseSongSpec(spec!), { style: "reggae joyeux", lyrics: "[Couplet]\nSur la barge\n[Refrain]\nMayotte" });
  });

  it("accepte des paroles sans style, refuse des paroles vides ou trop longues", () => {
    assert.equal(voiceSongSpec(undefined, "La la la"), "La la la");
    assert.equal(voiceSongSpec("jazz", "  "), null);
    assert.equal(voiceSongSpec("jazz", Array.from({ length: 40 }, (_, i) => `vers ${i}`).join("\n")), null);
  });
});

describe("Chansons de Tamilya : au casque", () => {
  it("baisse doucement sur les dernières secondes au lieu de couper net", () => {
    assert.equal(fadeAt(10, 30), 1);
    assert.equal(fadeAt(30 - SONG_FADE, 30), 1);
    assert.ok(fadeAt(28.5, 30) > 0.4 && fadeAt(28.5, 30) < 0.6);
    assert.equal(fadeAt(30, 30), 0);
    assert.equal(fadeAt(5, Number.NaN), 1);
  });

  it("fait un tour autour de la tête de temps en temps, puis revient devant", () => {
    assert.equal(orbitAt(3, 30), null);
    assert.equal(orbitAt(ORBIT.first + 0.001, 30)?.angle.toFixed(0), "0");
    const middle = orbitAt(ORBIT.first + ORBIT.length / 2, 30)!;
    assert.ok(Math.abs(Math.abs(middle.angle) - 180) < 1, "derrière la tête au milieu du tour");
    assert.equal(orbitAt(ORBIT.first + ORBIT.length + 1, 30), null);
    assert.equal(orbitAt(5, Number.NaN), null);
  });

  it("ne tourne jamais pendant la baisse finale", () => {
    // Un tour qui finirait dans la baisse n'a pas lieu.
    assert.equal(orbitAt(ORBIT.first + ORBIT.every + 1, 32), null);
    for (let t = 0; t < 30; t += 0.25) {
      if (orbitAt(t, 30)) assert.ok(t < 30 - SONG_FADE);
    }
  });
});

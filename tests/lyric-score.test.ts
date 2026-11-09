import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { frenchShare, rhymeStrength, scoreLyrics, syllables } from "../src/lib/music/lyric-score";
import { lyricistPrompt, pickBest } from "../src/lib/music/lyricist";

const AI = `[Couplet]
Ensemble on va briller sous la lumière
Nos cœurs unis vers les étoiles
Main dans la main pour toujours
Nos rêves vont s'envoler
[Refrain]
L'espoir dans nos âmes
La magie de la vie`;

const HUMAN = `[Couplet]
La barge tangue, j'ai du sel sur la manche
Ton message en vu depuis dimanche
Le ciel de Dzaoudzi rougit sans prévenir
J'ai garé mes excuses au bord du soupir
[Refrain]
Dis-moi juste où tu dors ce soir
Je laisse la lampe allumée sur le trottoir`;

describe("Note des paroles", () => {
  it("met bien plus bas des paroles pleines de clichés d'IA", () => {
    const ai = scoreLyrics(AI);
    const human = scoreLyrics(HUMAN);
    assert.ok(ai.cliches >= 6, `clichés comptés : ${ai.cliches}`);
    assert.equal(human.cliches, 0);
    assert.ok(human.score > ai.score + 5, `${human.score} contre ${ai.score}`);
  });

  it("reconnaît une rime riche, une rime pauvre et le même mot", () => {
    assert.ok(rhymeStrength("j'ai du sel sur la manche", "depuis dimanche") >= 4);
    assert.equal(rhymeStrength("il fait chaud", "je cours vite"), 0);
    assert.equal(rhymeStrength("je pense à toi", "tout est pour toi"), -1);
  });

  it("compte les syllabes à peu près (e muet final ôté)", () => {
    assert.equal(syllables("La barge tangue"), 4);
    assert.equal(syllables("Dis-moi juste où tu dors"), 6);
  });

  it("des vers de longueurs très différentes coûtent des points", () => {
    const even = scoreLyrics("[Couplet]\nLa mer est grise ce matin\nLe port se tait sur mon chemin");
    const uneven = scoreLyrics("[Couplet]\nLa mer\nLe port se tait doucement sous la pluie qui tombe sur mon chemin");
    assert.ok(even.score > uneven.score);
  });

  it("un refrain répété mot pour mot n'est pas puni", () => {
    const once = scoreLyrics(HUMAN);
    const twice = scoreLyrics(`${HUMAN}\n[Refrain]\nDis-moi juste où tu dors ce soir\nJe laisse la lampe allumée sur le trottoir`);
    assert.equal(twice.score, once.score);
  });

  it("sait si les paroles sont en français (le shimaoré n'est jamais réécrit)", () => {
    assert.ok(frenchShare(HUMAN) >= 0.2);
    assert.ok(frenchShare("Wami nisi lawa\nMaore mwema\nNgamina ndzia") < 0.2);
  });
});

describe("Parolier", () => {
  it("garde la version de Tamilya à égalité", () => {
    const s = scoreLyrics(HUMAN);
    assert.equal(pickBest([s, s, s]), 0);
    assert.equal(pickBest([scoreLyrics(AI), s]), 1);
  });

  it("la consigne garde le style, les balises et la langue", () => {
    const prompt = lyricistPrompt({ style: "rap sombre", lyrics: HUMAN }, "Priorité : test.");
    assert.match(prompt, /rap sombre/);
    assert.match(prompt, /mêmes balises/);
    assert.match(prompt, /la langue/);
    assert.match(prompt, /La barge tangue/);
  });
});

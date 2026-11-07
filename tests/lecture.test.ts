import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectReading, parseReadingBlock, readingText, withReadingBlock } from "../src/lib/lecture/intent";
import { AMBIENCES, assignVoices, buildScript, EFFECTS, PLACES, READING_LIMITS } from "../src/lib/lecture/script";
import { between, ROOMS } from "../src/lib/lecture/soundscape";
import { renderSamples } from "../src/lib/lecture/sounds";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";
import { DEFAULT_PERSONALITY } from "../src/lib/ai/personalities";

describe("Lecture en 3D : demande reconnue", () => {
  it("reconnaît une demande de lecture", () => {
    for (const message of ["Lis-moi cette page", "tu peux me lire une page de mon livre ?", "lis moi un livre", "Raconte-moi ce chapitre", "lecture 3D", "lis-nous la suite de ce livre", "relis-moi ce passage"]) {
      assert.equal(detectReading(message), true, message);
    }
  });

  it("ne se déclenche pas pour une simple question sur les livres", () => {
    for (const message of ["c'est quoi ton livre préféré ?", "raconte-moi une histoire", "j'ai lu un livre hier", "la page d'accueil ne marche pas", "chante-moi une chanson"]) {
      assert.equal(detectReading(message), false, message);
    }
  });
});

describe("Lecture en 3D : script de scène", () => {
  const raw = {
    lisible: true,
    titre: "Le vieux pêcheur",
    lieu: "plage",
    intro: "Mets tes écouteurs et ferme les yeux…",
    decor: [
      { son: "vagues", cote: -60, distance: "loin", volume: 0.5, bouge: false },
      { son: "vent", cote: 90, distance: "pres", volume: 0.4, bouge: true },
      { son: "vent", cote: 0, distance: "pres", volume: 0.4, bouge: true },
      { son: "klaxon", cote: 0, distance: "pres", volume: 0.4, bouge: false },
    ],
    personnages: [
      { id: "pecheur", nom: "Ali", genre: "homme", age: "vieux" },
      { id: "fillette", nom: "", genre: "femme", age: "enfant" },
    ],
    repliques: [
      { qui: "narratrice", texte: "Le soir tombait sur la plage.", cote: 120, bruits: [{ son: "rafale", quand: "avant", cote: -90, vers: 90 }] },
      { qui: "pecheur", texte: "Viens par ici, petite !", cote: -70, distance: "pres", depuis: { cote: 170, distance: "loin" } },
      { qui: "fillette", texte: "J'arrive !", cote: 70, hauteur: "haut", bruits: [{ son: "pas", quand: "pendant", cote: 180, vers: 70 }, { son: "inconnu", quand: "pendant", cote: 0 }] },
      { qui: "pecheur", texte: "", cote: 0 },
    ],
  };

  it("garde la narratrice au milieu et donne une voix à chaque personnage", () => {
    const result = buildScript(raw, "Leda");
    assert.ok(result.ok);
    const { lines, ambiences } = result.script;
    assert.equal(lines.length, 3, "réplique vide écartée");
    assert.deepEqual([lines[0].voice, lines[0].side, lines[0].speaker], [null, 0, "Tamilya"]);
    assert.equal(lines[1].voice, "Charon");
    assert.equal(lines[1].speaker, "Ali");
    assert.equal(lines[2].speaker, "fillette");
    assert.notEqual(lines[2].voice, null);
    assert.notEqual(lines[2].voice, "Leda");
    assert.equal(result.script.place, "plage");
    assert.equal(lines[2].height, "haut");
    assert.deepEqual(lines[1].from, { side: 170, distance: "loin", height: "milieu" });
    assert.deepEqual(lines[0].cues, [{ sound: "rafale", when: "avant", from: -90, to: 90, distance: "pres", height: "milieu" }]);
    assert.equal(lines[2].cues[0].height, "bas", "des pas viennent du sol");
    assert.deepEqual(lines[2].cues.map((c) => c.sound), ["pas"], "bruit inconnu écarté");
    assert.deepEqual(ambiences.map((a) => a.sound), ["vagues", "vent"], "doublon et bruit inconnu écartés");
  });

  it("refuse une photo illisible avec la raison donnée", () => {
    const result = buildScript({ ...raw, lisible: false, raison: "La photo est floue." }, "Leda");
    assert.deepEqual(result, { ok: false, reason: "La photo est floue." });
  });

  it("borne les places et le nombre de répliques", () => {
    const many = Array.from({ length: 90 }, (_, i) => ({ qui: "narratrice", texte: `Phrase ${i}`, cote: 0 }));
    const result = buildScript({ ...raw, repliques: [{ qui: "pecheur", texte: "Ho !", cote: 999 }, ...many] }, "Leda");
    assert.ok(result.ok);
    assert.equal(result.script.lines.length, READING_LIMITS.lines);
    assert.equal(result.script.lines[0].side, 180);
  });

  it("ne donne jamais la voix de Tamilya ni deux fois la même voix", () => {
    const characters = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, genre: "femme" as const, age: "jeune" as const }));
    const voices = [...assignVoices(characters, "Aoede").values()];
    assert.equal(new Set(voices).size, voices.length);
    assert.ok(!voices.includes("Aoede"));
  });
});

describe("Lecture en 3D : lieux et trajets", () => {
  it("chaque lieu a sa pièce, et un lieu inconnu devient le plein air", () => {
    for (const place of PLACES) assert.ok(ROOMS[place].dimensions.width > 0, place);
    const result = buildScript({ lisible: true, titre: "", lieu: "lune", intro: "", decor: [], personnages: [], repliques: [{ qui: "narratrice", texte: "Il était une fois.", cote: 0 }] }, "Leda");
    assert.ok(result.ok);
    assert.equal(result.script.place, "plein-air");
  });

  it("le son tourne autour de la tête par le plus court chemin", () => {
    // De 170 à -170 : on passe par derrière (180), pas par devant.
    assert.equal(Math.round(Math.abs(between({ side: 170, distance: "pres" }, { side: -170, distance: "pres" }, 0.5).side)), 180);
    const middle = between({ side: -90, distance: "loin", height: "bas" }, { side: 90, distance: "pres", height: "haut" }, 0.5);
    assert.equal(Math.round(middle.side), 0);
    assert.ok(middle.meters > 1.6 && middle.meters < 6);
  });
});

describe("Lecture en 3D : bruits fabriqués", () => {
  it("chaque bruit a du son, sans saturer", () => {
    for (const sound of [...AMBIENCES, ...EFFECTS]) {
      const samples = renderSamples(sound, 8_000);
      let peak = 0;
      let energy = 0;
      for (const v of samples) {
        assert.ok(Number.isFinite(v), sound);
        peak = Math.max(peak, Math.abs(v));
        energy += v * v;
      }
      assert.ok(peak > 0.3 && peak <= 1, `${sound} : crête ${peak}`);
      assert.ok(energy / samples.length > 1e-5, `${sound} : trop faible`);
    }
  });
});

describe("Lecture en 3D : consigne de Tamilya", () => {
  it("demande le bloc lecture-3d seulement quand on lui demande de lire", () => {
    const withReading = buildSystemPrompt(DEFAULT_PERSONALITY, { reading: "photo" });
    const withText = buildSystemPrompt(DEFAULT_PERSONALITY, { reading: "texte" });
    const without = buildSystemPrompt(DEFAULT_PERSONALITY, {});
    assert.match(withReading, /```lecture-3d\npage\n```/);
    assert.match(withText, /```lecture-3d\ntexte\n```/);
    assert.match(withText, /n'invente pas d'histoire/);
    assert.doesNotMatch(without, /lecture-3d/);
  });
});

describe("Lecture en 3D : texte écrit dans la conversation", () => {
  const story = "La nuit était tombée sur la plage de Moya. Les vagues roulaient dans le noir. « Grand-père, tu entends le vent ? » demanda Zaïna. Le vieil homme sourit et regarda la mer, longtemps.";

  it("reconnaît « lis-moi ce message » et ses variantes, pas une demande d'histoire nouvelle", () => {
    for (const message of ["lis moi ce message", "Lis-moi ce texte", "lis-moi cette histoire", "tu peux me lire ça ?", "relis-moi le message"]) {
      assert.equal(detectReading(message), true, message);
    }
    for (const message of ["raconte-moi une histoire", "lis une histoire sur Mayotte", "j'ai lu ton message"]) {
      assert.equal(detectReading(message), false, message);
    }
  });

  it("prend le texte du message, sans la phrase de demande, sinon celui du message précédent", () => {
    assert.equal(readingText(`Lis-moi ce message\n${story}`, null), story);
    assert.equal(readingText("lis moi ce message", story), story);
    assert.equal(readingText("lis-moi cette page", "salut"), null, "trop court : photo");
    assert.ok(!readingText("lis moi ça", `${story}\n\`\`\`code\`\`\``)!.includes("```"));
  });

  it("glisse le texte dans le bloc écrit par Tamilya, ou ajoute le bloc", () => {
    const reply = "Mets ton casque et ferme les yeux.\n\n```lecture-3d\ntexte\n```";
    const filled = withReadingBlock(reply, story);
    assert.equal(filled, `Mets ton casque et ferme les yeux.\n\n\`\`\`lecture-3d\ntexte\n${story}\n\`\`\``);
    assert.equal(parseReadingBlock(`texte\n${story}`), story);
    assert.equal(parseReadingBlock("page"), null);
    assert.match(withReadingBlock("Ferme les yeux.", story), /```lecture-3d\ntexte\n/);
    assert.equal(withReadingBlock(filled, story), filled, "déjà rempli : rien ne change");
  });
});

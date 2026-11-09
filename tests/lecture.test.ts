import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectReading, isReadingRequest, parseReadingBlock, readingText, withReadingBlock } from "../src/lib/lecture/intent";
import { alternateRepeats, AMBIENCES, assignVoices, buildScript, EFFECTS, PLACES, READING_LIMITS, type SoundCue } from "../src/lib/lecture/script";
import { along, between, flyby, ROOMS } from "../src/lib/lecture/soundscape";
import { renderSamples, SYNTHESIZED } from "../src/lib/lecture/sounds";
import { buildSystemPrompt } from "../src/lib/ai/system-prompt";
import { DEFAULT_PERSONALITY } from "../src/lib/ai/personalities";

describe("Lecture en 3D : demande reconnue", () => {
  it("reconnaît une demande de lecture", () => {
    for (const message of ["Lis-moi cette page", "tu peux me lire une page de mon livre ?", "lis moi un livre", "Raconte-moi ce chapitre", "lecture 3D", "lis-nous la suite de ce livre", "relis-moi ce passage", "Raconte cette histoire", "raconte-moi ce texte"]) {
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
    assert.deepEqual(lines[0].cues, [
      { sound: "rafale", when: "avant", from: -90, to: 90, distance: "pres", height: "milieu", path: [{ side: 90, distance: "pres", height: "milieu" }] },
    ]);
    assert.equal(lines[0].placed, false, "le récit reste au milieu");
    assert.equal(lines[2].cues[0].height, "bas", "des pas viennent du sol");
    assert.deepEqual(lines[2].cues.map((c) => c.sound), ["pas"], "bruit inconnu écarté");
    assert.deepEqual(ambiences.map((a) => a.sound), ["vagues", "vent"], "doublon et bruit inconnu écartés");
  });

  it("place la narratrice à l'endroit du bruit qu'elle imite, et suit les trajets", () => {
    const result = buildScript(
      {
        ...raw,
        repliques: [
          { qui: "narratrice", texte: "Toc, toc, toc !", bruitage: true, cote: -80, distance: "pres", depuis: null, trajet: [] },
          { qui: "narratrice", texte: "Personne ne répondit.", bruitage: false, cote: -80, distance: "loin" },
          { qui: "pecheur", texte: "Je fais le tour.", cote: 90, trajet: [{ cote: -120, distance: "pres" }, { cote: 180, distance: "tout-pres", hauteur: "bas" }] },
          {
            qui: "narratrice",
            texte: "Un scooter passa.",
            bruits: [{ son: "pas", quand: "pendant", cote: -100, distance: "tres-loin", vers: 100, trajet: [{ cote: 0, distance: "tout-pres" }] }],
          },
        ],
      },
      "Leda",
    );
    assert.ok(result.ok);
    const [knock, plain, walk, pass] = result.script.lines;
    assert.deepEqual([knock.voice, knock.placed, knock.side, knock.distance], [null, true, -80, "pres"]);
    assert.deepEqual([plain.placed, plain.side, plain.distance, plain.path], [false, 0, "tout-pres", []]);
    assert.deepEqual(walk.path, [
      { side: -120, distance: "pres", height: "milieu" },
      { side: 180, distance: "tout-pres", height: "bas" },
    ]);
    assert.deepEqual(
      pass.cues[0].path.map((p) => [p.side, p.distance]),
      [
        [0, "tout-pres"],
        [100, "tout-pres"],
      ],
      "l'arrivée garde la distance du dernier point",
    );
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

  it("un trajet passe par tous ses points, et ce qui traverse frôle la tête", () => {
    const tour = [
      { side: 90, distance: "pres" as const },
      { side: 180, distance: "pres" as const },
      { side: -90, distance: "pres" as const },
    ];
    assert.equal(Math.round(along(tour, 0).side), 90);
    assert.equal(Math.round(Math.abs(along(tour, 0.5).side)), 180, "passe par derrière");
    assert.equal(Math.round(along(tour, 1).side), -90);
    const pass = flyby({ side: -80, distance: "loin" }, { side: 80, distance: "loin" });
    assert.deepEqual(pass.map((p) => [Math.round(p.side), p.distance]), [
      [-80, "loin"],
      [0, "pres"],
      [80, "loin"],
    ]);
    assert.equal(flyby({ side: 0, distance: "pres" }, { side: 40, distance: "pres" }).length, 2, "un petit pas de côté ne frôle rien");
  });
});

describe("Lecture en 3D : bruits fabriqués", () => {
  it("chaque bruit a du son, sans saturer", () => {
    for (const sound of SYNTHESIZED) {
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

  it("accepte les fautes de frappe, et le texte collé juste après la demande", () => {
    for (const message of ["Los moi cette histoire", "li moi ce texte", "lie moi ce message", "lus moi cette page"]) {
      assert.equal(detectReading(message), true, message);
    }
    for (const message of ["les moi", "lie le colis", "lus hier soir"]) assert.equal(detectReading(message), false, message);
    assert.equal(isReadingRequest(story, "Los moi cette histoire"), true, "histoire collée après la demande");
    assert.equal(readingText(story, "Los moi cette histoire"), story);
    assert.equal(isReadingRequest("merci beaucoup", "lis moi cette histoire"), false, "message court : pas de lecture");
    assert.equal(isReadingRequest(story, "salut ça va ?"), false, "texte sans demande : pas de lecture");
  });

  it("prend le texte du message, sans la phrase de demande, sinon celui du message précédent", () => {
    assert.equal(readingText(`Lis-moi ce message\n${story}`, null), story);
    assert.equal(readingText("lis moi ce message", story), story);
    assert.equal(readingText("lis-moi cette page", "salut"), null, "trop court : photo");
    assert.ok(!readingText("lis moi ça", `${story}\n\`\`\`code\`\`\``)!.includes("```"));
  });

  it("conte de Moya (2026-11-08) : chaque message lance la lecture de l'histoire collée", () => {
    const page = `Page 1 : La nuit des grandes vagues\n${story}`;
    const first = `Je veux que tu me lise cette page je veux vivre la page "${page}"`;
    assert.equal(isReadingRequest(first, null), true, "« me lise cette page »");
    assert.equal(readingText(first, null), page, "texte sans la demande ni les guillemets");
    for (const message of ["En vocal", "Lance la lecture 3d", "avec les effets spéciaux", "lis-le à voix haute", "vas-y lis-la"]) {
      assert.equal(isReadingRequest(message, [first]), true, message);
      assert.equal(readingText(message, [first]), page, message);
    }
    assert.equal(readingText("Lance la lecture 3d", ["En vocal", first]), page, "histoire deux messages plus haut");
    assert.equal(readingText("Lance la lecture 3d", ["En vocal", "merci", first]), null, "trop loin : photo");
    assert.equal(isReadingRequest("En vocal", ["salut ça va ?"]), false, "rien à lire : pas de lecture");
    assert.equal(isReadingRequest("merci pour la lecture", [first]), false, "remerciement après la lecture");
    assert.equal(isReadingRequest("lance la lecture", [first]), true, "lance la lecture");
    assert.equal(isReadingRequest("tu peux m'expliquer pourquoi les zébus s'échappent la nuit à Mayotte ?", [first]), false, "vraie question");
    for (const message of ["je veux vivre la page", "fais-moi vivre cette histoire"]) assert.equal(detectReading(message), true, message);
  });

  it("ne nie jamais la lecture en 3D quand elle existe pour la personne", () => {
    const prompt = buildSystemPrompt(DEFAULT_PERSONALITY, { readingOffer: true });
    assert.match(prompt, /Ne dis jamais que tu ne sais pas le faire/);
    assert.doesNotMatch(buildSystemPrompt(DEFAULT_PERSONALITY, {}), /Ne dis jamais que tu ne sais pas le faire/);
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

describe("Lecture en 3D : banque de sons", () => {
  it("chaque son enregistré a son fichier, et chaque son a un enregistrement ou une version fabriquée", async () => {
    const { existsSync } = await import("node:fs");
    const { RECORDED, soundUrl } = await import("../src/lib/lecture/bank");
    const { isPlayable } = await import("../src/lib/lecture/sounds");
    for (const sound of RECORDED) assert.ok(existsSync(`public${soundUrl(sound)}`), `${sound} : fichier manquant`);
    for (const sound of [...AMBIENCES, ...EFFECTS]) assert.ok(isPlayable(sound), `${sound} : aucun son`);
  });
});

describe("Lecture en 3D : les sons répétés alternent les côtés", () => {
  const cue = (from: number, extra: Partial<SoundCue> = {}): SoundCue => ({ sound: "frapper", when: "pendant", from, to: null, distance: "pres", height: "milieu", path: [], ...extra });

  it("toc au milieu, toc au milieu : gauche puis droite", () => {
    assert.deepEqual(alternateRepeats([cue(0), cue(0), cue(0)]).map((c) => c.from), [-70, 70, -70]);
  });

  it("deux fois à gauche : la seconde passe à droite", () => {
    assert.deepEqual(alternateRepeats([cue(-90), cue(-80)]).map((c) => c.from), [-90, 90]);
  });

  it("déjà de part et d'autre, ou un bruit qui voyage : rien ne change", () => {
    assert.deepEqual(alternateRepeats([cue(-90), cue(90)]).map((c) => c.from), [-90, 90]);
    const moving = [cue(0, { to: 90 }), cue(0, { to: -90 })];
    assert.deepEqual(alternateRepeats(moving), moving);
  });
});

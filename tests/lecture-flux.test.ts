import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markReadingAutoStart, takeReadingAutoStart } from "../src/lib/lecture/auto";
import { parseReadingSpec, readingMode, withSceneBlock } from "../src/lib/lecture/intent";
import { SCRIPT_SCHEMA, scriptPrompt } from "../src/lib/lecture/prompt";
import { buildLine, buildMeta } from "../src/lib/lecture/script";
import { createScriptStream } from "../src/lib/lecture/stream";
import { pickWriterModels, writerPrompt } from "../src/lib/lecture/writer";
import { LIVE_RULES } from "../src/lib/voice-live/rules";
import { liveToolDeclarations } from "../src/lib/voice-live/tools";

const script = {
  lisible: true,
  titre: "Nuit à Moya",
  lieu: "plage",
  intro: "Mets tes écouteurs { et } ferme les yeux…",
  decor: [{ son: "vagues", cote: -60, distance: "loin", hauteur: "bas", volume: 0.5, bouge: false }],
  personnages: [{ id: "zaina", nom: "Zaïna", genre: "femme", age: "enfant" }],
  repliques: [
    { qui: "narratrice", texte: "La nuit tombait [doucement] sur \"Moya\".", cote: 0, distance: "pres", hauteur: "milieu", depuis: null, bruits: [] },
    { qui: "zaina", texte: "Grand-père, tu entends { le vent } ?", cote: -40, distance: "pres", hauteur: "milieu", depuis: null, bruits: [{ son: "rafale", quand: "avant", cote: -90, vers: 90, distance: "pres", hauteur: "milieu" }] },
    { qui: "narratrice", texte: "Le tonnerre gronda.", cote: 0, distance: "pres", hauteur: "milieu", depuis: null, bruits: [] },
  ],
};

describe("Lecture en 3D au fil de l'eau : découpage de la réponse de Gemini", () => {
  it("rend le début dès les répliques commencées, puis chaque réplique dès qu'elle est fermée", () => {
    const json = JSON.stringify(script);
    const stream = createScriptStream();
    let meta: unknown;
    const lines: unknown[] = [];
    // Morceaux de 7 caractères : coupés au milieu des mots, des guillemets et des accolades.
    for (let i = 0; i < json.length; i += 7) {
      const pieces = stream.push(json.slice(i, i + 7));
      if (pieces.meta !== undefined) {
        assert.equal(meta, undefined, "le début n'arrive qu'une fois");
        meta = pieces.meta;
        assert.equal(lines.length, 0, "le début arrive avant toute réplique");
      }
      lines.push(...pieces.lines);
    }
    assert.deepEqual(meta, { lisible: true, titre: "Nuit à Moya", lieu: "plage", intro: script.intro, decor: script.decor, personnages: script.personnages });
    assert.deepEqual(lines, script.repliques);
  });

  it("une réplique est rendue avant la fin de la réponse", () => {
    const json = JSON.stringify(script);
    const cut = json.indexOf("Le tonnerre");
    const stream = createScriptStream();
    const first = stream.push(json.slice(0, cut));
    assert.ok(first.meta);
    assert.equal(first.lines.length, 2, "les deux premières répliques sont prêtes, la troisième s'écrit encore");
    assert.equal(stream.push(json.slice(cut)).lines.length, 1);
  });

  it("impose l'ordre des clés à Gemini : les répliques en dernier", () => {
    assert.equal(SCRIPT_SCHEMA.propertyOrdering.at(-1), "repliques");
    assert.ok(SCRIPT_SCHEMA.propertyOrdering.indexOf("personnages") < SCRIPT_SCHEMA.propertyOrdering.indexOf("repliques"));
  });
});

describe("Lecture en 3D au fil de l'eau : distribution puis répliques", () => {
  it("donne les voix avec le début, puis range chaque réplique à part", () => {
    const meta = buildMeta(script, "Leda");
    assert.ok(meta.ok);
    assert.equal(meta.meta.place, "plage");
    assert.equal(meta.meta.ambiences[0].sound, "vagues");
    const line = buildLine(script.repliques[1], meta.cast);
    assert.equal(line?.speaker, "Zaïna");
    assert.notEqual(line?.voice, null);
    assert.equal(line?.cues[0].sound, "rafale");
    assert.equal(buildLine({ qui: "narratrice", texte: "" }, meta.cast), null, "réplique vide écartée");
  });

  it("refuse dès le début une page illisible", () => {
    assert.deepEqual(buildMeta({ ...script, lisible: false, raison: "La photo est floue." }, "Leda"), { ok: false, reason: "La photo est floue." });
  });
});

describe("Lecture en 3D : histoire inventée par Tamilya", () => {
  const story = "La nuit était tombée sur la plage de Moya. Les vagues roulaient dans le noir. « Grand-père, tu entends le vent ? » demanda Zaïna. Le vieil homme sourit et regarda la mer, longtemps, sans rien dire.";

  it("« lis-moi une histoire » : Tamilya l'invente, sans page ni photo", () => {
    for (const message of ["lis moi une histoire", "Raconte-moi une histoire", "raconte moi un conte de pêcheur à Mamoudzou", "invente une histoire qui fait peur", "los moi une histoire", "lis-moi cette histoire"]) {
      const mode = readingMode(message, null);
      assert.equal(mode?.kind, "histoire", message);
    }
    assert.deepEqual(readingMode("raconte-moi un conte de pêcheur", null), { kind: "histoire", request: "raconte-moi un conte de pêcheur" });
  });

  it("un texte donné est lu tel quel ; une page de livre demande une photo ; le reste ne lance rien", () => {
    assert.equal(readingMode(`Lis moi ce teste en 3d "${story}"`, null)?.kind, "texte", "faute « teste »");
    assert.equal(readingMode("lis moi cette histoire", [story])?.kind, "texte", "histoire collée juste avant");
    assert.deepEqual(readingMode("lis-moi cette page de mon livre", null), { kind: "page" });
    for (const message of ["c'est quoi ton livre préféré ?", "j'ai lu une histoire hier", "chante-moi une chanson"]) assert.equal(readingMode(message, null), null, message);
  });

  it("le serveur glisse la demande dans le bloc ; la carte attend qu'elle y soit", () => {
    const reply = withSceneBlock("Mets ton casque.\n\n```lecture-3d\nhistoire\n```", { kind: "histoire", request: "une histoire de maki" });
    assert.equal(reply, "Mets ton casque.\n\n```lecture-3d\nhistoire\nune histoire de maki\n```");
    assert.deepEqual(parseReadingSpec("histoire\nune histoire de maki\n"), { kind: "histoire", request: "une histoire de maki" });
    assert.equal(parseReadingSpec("histoire"), null, "bloc encore en train de s'écrire");
    assert.deepEqual(parseReadingSpec("page"), { kind: "page" });
  });

  it("à la fin, Tamilya prend des nouvelles avec une phrase écrite avec l'histoire, avant les répliques", () => {
    const meta = buildMeta({ ...script, fin: "Alors, tu es encore sur la plage avec eux ?" }, "Leda");
    assert.ok(meta.ok);
    assert.equal(meta.meta.outro, "Alors, tu es encore sur la plage avec eux ?");
    const order = SCRIPT_SCHEMA.propertyOrdering as readonly string[];
    assert.ok(order.indexOf("fin") < order.indexOf("repliques"), "la phrase de fin arrive avec le début, prête à temps");
    assert.match(scriptPrompt("histoire"), /La fin \(fin\)/);
  });

  it("la consigne de Gemini lui fait inventer l'histoire, déjà découpée en répliques", () => {
    assert.match(scriptPrompt("histoire"), /Invente une histoire originale/);
    assert.doesNotMatch(scriptPrompt("histoire"), /Recopie le texte/);
    assert.match(scriptPrompt("texte"), /Recopie le texte/);
  });

  it("le conteur Pro écrit l'histoire, puis Tamilya la lit telle quelle et la met en scène", () => {
    assert.deepEqual(pickWriterModels(["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro", "gemini-3-pro-preview", "gemini-2.5-pro-tts"]), ["gemini-3-pro", "gemini-2.5-pro"]);
    assert.deepEqual(pickWriterModels(["gemini-2.5-flash"]), [], "sans Pro, Flash invente comme avant");
    assert.match(writerPrompt("une histoire drôle de chèvre", []), /une histoire drôle de chèvre/);
    assert.match(scriptPrompt("ecrite"), /Recopie le texte/);
    assert.match(scriptPrompt("ecrite"), /déjà écrite par ton conteur/);
    assert.doesNotMatch(scriptPrompt("ecrite"), /Invente une histoire originale/);
  });
});

describe("Lecture en 3D depuis le vocal en direct", () => {
  it("le bouton lecture_3d existe et Tamilya ne dit jamais qu'elle ne sait pas lire en 3D", () => {
    const tools = liveToolDeclarations({ food: false, barge: false }) as { name: string }[];
    assert.ok(tools.some((tool) => tool.name === "lecture_3d"));
    assert.match(LIVE_RULES, /lecture_3d/);
    assert.match(LIVE_RULES, /Ne dis jamais que tu ne sais pas faire de lecture en 3D/);
  });

  it("la carte ajoutée par le vocal démarre seule, une seule fois", () => {
    markReadingAutoStart("texte\nIl était une fois.\n");
    assert.equal(takeReadingAutoStart("texte\nIl était une fois."), true);
    assert.equal(takeReadingAutoStart("texte\nIl était une fois."), false, "une ancienne carte rouverte ne redémarre pas");
  });
});

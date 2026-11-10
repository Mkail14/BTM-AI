import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bookContextSchema,
  bookShare,
  chunkParagraphs,
  cleanText,
  isSkippedPart,
  mendBreaks,
  nextChunk,
  pagesToParagraphs,
  runningLines,
  type PdfLine,
} from "../src/lib/lecture/book";
import { scriptPrompt, scriptSchema } from "../src/lib/lecture/prompt";
import { assignVoices, buildMeta } from "../src/lib/lecture/script";

const line = (text: string, y: number, x = 77, size = 15, end = 535): PdfLine => ({ text, x, y, size, end });

describe("Livre : texte du PDF", () => {
  it("recolle les lignes en paragraphes et les mots coupés", () => {
    const page = [
      line("Un jour, vers la fin de l'an 432, les citoyens d'Athènes reçurent des", 672, 95),
      line("nouvelles très inquié-", 651),
      line("tantes : la cité-", 630),
      line("État de Sparte menaçait.", 609, 77, 15, 240),
      line("Un autre paragraphe commence ici.", 588, 95, 15, 300),
    ];
    assert.deepEqual(pagesToParagraphs([page]), [
      "Un jour, vers la fin de l'an 432, les citoyens d'Athènes reçurent des nouvelles très inquiétantes : la cité-État de Sparte menaçait.",
      "Un autre paragraphe commence ici.",
    ]);
  });

  it("enlève les numéros de page et les titres courants", () => {
    const pages = Array.from({ length: 10 }, (_, n) => [line("Les lois de la nature humaine", 760), line(`${["Un", "Deux", "Trois", "Quatre", "Cinq", "Six", "Sept", "Huit", "Neuf", "Dix"][n]} : texte de la page.`, 700, 95, 15, 300), line(`Suite ${"abcdefghij"[n]}.`, 680, 95, 15, 200), line(String(n + 1), 40)]);
    const paragraphs = pagesToParagraphs(pages, runningLines(pages));
    assert.equal(paragraphs.length, 10);
    assert.ok(paragraphs.every((p) => p.includes("texte de la page") && !p.includes("Les lois")));
  });

  it("recolle une phrase coupée en deux paragraphes", () => {
    assert.deepEqual(mendBreaks(["Si vous tombez sur un trait de", "sottise… veillez à ne pas", "Arthur Schopenhauer", "Tout commence."]), [
      "Si vous tombez sur un trait de sottise… veillez à ne pas",
      "Arthur Schopenhauer",
      "Tout commence.",
    ]);
  });

  it("corrige les o mal reconnus et écarte les parties sans lecture", () => {
    assert.equal(cleanText("Méditons sur n°tre mortalité, étape n° 1"), "Méditons sur notre mortalité, étape n° 1");
    for (const title of ["Bibliographie", "Remerciements", "Les éditions Alisio", "Auteur"]) assert.equal(isSkippedPart(title), true, title);
    for (const title of ["Introduction", "1 - Maîtrisez votre moi émotionnel"]) assert.equal(isSkippedPart(title), false, title);
  });
});

describe("Livre : morceaux", () => {
  it("ne coupe pas un paragraphe qui tient, et coupe un trop long entre deux phrases", () => {
    const short = "Phrase courte.";
    const long = Array.from({ length: 80 }, (_, i) => `Phrase numéro ${i} assez longue pour remplir.`).join(" ");
    const chunks = chunkParagraphs([short, long, short], 1000);
    assert.ok(chunks.every((c) => c.length <= 1000));
    assert.equal(chunks.join(" ").replace(/\s+/g, " "), [short, long, short].join(" "));
    assert.ok(chunks.slice(0, -1).every((c) => /[.!?]$/.test(c)));
  });

  it("passe au chapitre suivant et mesure l'avancée", () => {
    const book = { chapters: [{ title: "A", chunks: ["1", "2"] }, { title: "B", chunks: [] }, { title: "C", chunks: ["3", "4"] }] };
    assert.deepEqual(nextChunk(book, 0, 0), { chapter: 0, chunk: 1 });
    assert.deepEqual(nextChunk(book, 0, 1), { chapter: 2, chunk: 0 });
    assert.equal(nextChunk(book, 2, 1), null);
    assert.equal(bookShare(book, 2, 0), 0.5);
  });
});

describe("Livre : continuité entre les morceaux", () => {
  const known = [{ id: "pericles", nom: "Périclès", genre: "homme" as const, age: "adulte" as const, voix: "Charon" as const }];

  it("garde la voix d'un personnage déjà entendu et en donne une autre aux nouveaux", () => {
    const voices = assignVoices(
      [
        { id: "pericles", genre: "homme", age: "adulte" },
        { id: "messager", genre: "homme", age: "vieux" },
      ],
      "Leda",
      new Map([["pericles", "Charon"]]),
    );
    assert.equal(voices.get("pericles"), "Charon");
    assert.notEqual(voices.get("messager"), "Charon");
  });

  it("rend la distribution et le résumé pour le morceau suivant, même pour un personnage non redéclaré", () => {
    const meta = buildMeta(
      { lisible: true, titre: "Athéna", lieu: "grande-salle", intro: "", fin: "", resume: "Périclès hésite.", musique: null, decor: [], personnages: [], repliques: [] },
      "Leda",
      undefined,
      known,
    );
    assert.ok(meta.ok);
    if (!meta.ok) return;
    assert.equal(meta.meta.summary, "Périclès hésite.");
    assert.deepEqual(meta.meta.cast, known);
    assert.equal(meta.cast.voices.get("pericles"), "Charon");
  });

  it("donne à Gemini la mémoire du livre et demande le résumé", () => {
    const context = bookContextSchema.parse({ livre: "Les lois", chapitre: "1 - La loi", nouveauChapitre: true, reprise: false, fin: false, resume: "On parlait d'Athènes.", personnages: known, lieu: "rue", musique: "calme", decor: ["vent"] });
    const prompt = scriptPrompt("livre", undefined, context);
    assert.match(prompt, /On parlait d'Athènes\./);
    assert.match(prompt, /pericles \(Périclès, homme, adulte\)/);
    assert.match(prompt, /annonce la partie qui commence/);
    assert.ok(scriptSchema(undefined, true).required.includes("resume"));
    assert.ok(!(scriptSchema().required as readonly string[]).includes("resume"));
  });
});

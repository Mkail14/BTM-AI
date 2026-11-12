import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { DEFAULT_PERSONALITY } from "@/lib/ai/personalities";
import { blanksInLine, findBlanks, findSignatureLine, guessValue, parseFillValues } from "@/lib/document-signe/blanks";
import { readDocx, writeDocx, type XmlTools } from "@/lib/document-signe/docx";
import { detectDocumentTask, documentBlock, readDocumentTask } from "@/lib/document-signe/intent";
import { writePdf } from "@/lib/document-signe/pdf";

const tools = { parser: new DOMParser(), serializer: new XMLSerializer() } as unknown as XmlTools;

/** Plus petit PNG valide (1 × 1, transparent). */
const PNG = Uint8Array.from(
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"),
);

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function docx(paragraphs: string[][]) {
  const body = paragraphs.map((runs) => `<w:p>${runs.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join("")}</w:p>`).join("");
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    ),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${body}<w:sectPr/></w:body></w:document>`),
  });
}

describe("Document à signer : la demande", () => {
  it("reconnaît signer, remplir, ou les deux", () => {
    assert.deepEqual(detectDocumentTask("Tu peux signer ce PDF pour moi ?"), { sign: true, fill: false });
    assert.deepEqual(detectDocumentTask("mets ma signature sur le document"), { sign: true, fill: false });
    assert.deepEqual(detectDocumentTask("colle ma signature stp"), { sign: true, fill: false });
    assert.deepEqual(detectDocumentTask("remplis ce formulaire"), { sign: false, fill: true });
    assert.deepEqual(detectDocumentTask("complète mon document word et signe le contrat"), { sign: true, fill: true });
  });

  it("laisse passer les questions et l'attestation d'hébergement", () => {
    assert.equal(detectDocumentTask("c'est quoi une signature électronique ?"), null);
    assert.equal(detectDocumentTask("remplis une attestation d'hébergement"), null);
    assert.equal(detectDocumentTask("Bonjour Tamilya"), null);
    assert.equal(detectDocumentTask("je dois signer en bas ?"), null);
  });

  it("écrit et relit le bloc", () => {
    assert.match(documentBlock({ sign: true, fill: true }), /```document-a-signer\nremplir signer\n```/);
    assert.deepEqual(readDocumentTask("signer"), { sign: true, fill: false });
    assert.deepEqual(readDocumentTask(""), { sign: true, fill: true });
  });

  it("donne la consigne à Tamilya seulement si c'est allumé", () => {
    const on = buildSystemPrompt(DEFAULT_PERSONALITY, { documentOffer: true, documentTask: { sign: true, fill: false } });
    assert.match(on, /```document-a-signer\nsigner\n```/);
    assert.match(on, /POUR CE MESSAGE/);
    assert.doesNotMatch(buildSystemPrompt(DEFAULT_PERSONALITY, {}), /document-a-signer/);
  });
});

describe("Document à signer : les cases", () => {
  it("trouve les cases à pointillés et en fin de ligne", () => {
    assert.deepEqual(
      blanksInLine("Né(e) le : ........ à : ________").map((b) => b.label),
      ["Né(e) le", "à"],
    );
    assert.deepEqual(blanksInLine("Nom :"), [{ label: "Nom", start: 5, end: 5 }]);
    assert.deepEqual(blanksInLine("Signature : ..........."), []);
    assert.deepEqual(blanksInLine("Il était une fois..."), []);
  });

  it("une ligne sans libellé continue la case d'au-dessus", () => {
    const blanks = findBlanks(["Adresse : ..............", "...................."]);
    assert.deepEqual(blanks.map((b) => b.label), ["Adresse", "Adresse (suite)"]);
  });

  it("trouve la ligne de signature", () => {
    assert.equal(findSignatureLine(["Contrat", "Fait à Mamoudzou", "Signature du salarié :", "Page 1"]), 2);
    assert.equal(findSignatureLine(["Rien ici"]), -1);
  });

  it("remplit les cases évidentes avec le compte, et rien d'inventé", () => {
    const info = { firstName: "Awa", lastName: "Madi", birthDate: "1990-04-02", city: "Sada", postalCode: "97640", address: "12 rue du Lagon", email: "awa@example.com" };
    const today = "2026-11-12";
    assert.equal(guessValue("Prénom", info, today), "Awa");
    assert.equal(guessValue("Nom", info, today), "Madi");
    assert.equal(guessValue("Nom et prénom", info, today), "Madi Awa");
    assert.equal(guessValue("Né(e) le", info, today), "02/04/1990");
    assert.equal(guessValue("Fait à", info, today), "Sada");
    assert.equal(guessValue("Le", info, today), "12/11/2026");
    assert.equal(guessValue("Adresse", info, today), "12 rue du Lagon, 97640 Sada");
    assert.equal(guessValue("Adresse e-mail", info, today), "awa@example.com");
    assert.equal(guessValue("Nom de l'employeur", info, today), "");
    assert.equal(guessValue("Numéro de sécurité sociale", info, today), "");
  });

  it("lit la réponse de l'IA même entourée de texte", () => {
    assert.deepEqual(parseFillValues('```json\n["Awa", "", 3]\n```', 4), ["Awa", "", "", ""]);
    assert.equal(parseFillValues("je ne sais pas", 2), null);
  });
});

describe("Document à signer : Word", () => {
  it("remplit les cases sans casser les morceaux de texte", () => {
    const bytes = docx([["Nom : ", "........"], ["Prénom :"], ["Fait à ", "....", " le ", "...."], ["Signature :"]]);
    const reading = readDocx(bytes, tools);
    assert.deepEqual(reading.blanks.map((b) => b.label), ["Nom", "Prénom", "Fait à", "le"]);
    assert.equal(reading.signatureParagraph, 3);

    const values = ["Madi", "Awa", "Sada", "12/11/2026"];
    const out = writeDocx(bytes, reading.blanks.map((b, i) => ({ paragraph: b.paragraph, start: b.start, end: b.end, value: values[i] })), undefined, tools);
    const texts = readDocx(out, tools);
    assert.deepEqual(texts.blanks, []);
    const xml = strFromU8(unzipSync(out)["word/document.xml"]);
    assert.match(xml, /Nom : <\/w:t><\/w:r><w:r><w:t xml:space="preserve">Madi</);
    assert.match(xml, /Prénom : ?Awa/);
    assert.match(xml, />Sada</);
    assert.match(xml, />12\/11\/2026</);
  });

  it("pose la signature sous « Signature » et l'ajoute au paquet", () => {
    const bytes = docx([["Contrat"], ["Signature :"], ["Fin"]]);
    const out = writeDocx(bytes, [], { png: PNG, ratio: 0.4, paragraph: 1 }, tools);
    const files = unzipSync(out);
    assert.ok(files["word/media/signature-tamilya.png"]);
    assert.match(strFromU8(files["word/_rels/document.xml.rels"]), /Target="media\/signature-tamilya.png"/);
    assert.match(strFromU8(files["[Content_Types].xml"]), /Extension="png"/);
    const xml = strFromU8(files["word/document.xml"]);
    assert.ok(xml.indexOf("Signature :") < xml.indexOf("<w:drawing") && xml.indexOf("<w:drawing") < xml.indexOf("Fin"));
    assert.match(xml, /cx="1620000" cy="648000"/);
  });
});

describe("Document à signer : PDF", () => {
  it("écrit les valeurs et pose la signature", async () => {
    const source = await PDFDocument.create();
    source.addPage([595, 842]);
    const out = await writePdf(
      await source.save(),
      [{ spot: { page: 0, x: 100, y: 700, size: 10, room: 200 }, value: "Madi Awa" }],
      { png: PNG, place: { page: 0, x: 300, top: 200, width: 150 }, ratio: 0.4 },
    );
    const pdf = await PDFDocument.load(out);
    assert.equal(pdf.getPageCount(), 1);
    assert.ok(out.length > (await source.save()).length);
  });
});

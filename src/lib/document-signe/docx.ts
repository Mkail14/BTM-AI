import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { findBlanks, findSignatureLine } from "./blanks";

/**
 * Document Word (.docx) ouvert, rempli et signé dans le navigateur : il ne quitte pas
 * l'appareil, et il reste un Word. Un .docx est un dossier zippé ; le texte est dans
 * word/document.xml, découpé en paragraphes (w:p) faits de morceaux (w:t).
 */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const RELS = "http://schemas.openxmlformats.org/package/2006/relationships";
const IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";
const CONTENT_TYPES = "http://schemas.openxmlformats.org/package/2006/content-types";

const DOCUMENT = "word/document.xml";
const DOCUMENT_RELS = "word/_rels/document.xml.rels";

/** Pour les tests (Node n'a pas de DOMParser) : le navigateur fournit les siens. */
export type XmlTools = { parser: DOMParser; serializer: XMLSerializer };
const browserTools = (): XmlTools => ({ parser: new DOMParser(), serializer: new XMLSerializer() });

export class NotDocx extends Error {}

type Part = { node: Element; from: number; to: number };
type Paragraph = { node: Element; text: string; parts: Part[] };

function paragraphs(doc: Document): Paragraph[] {
  const list: Paragraph[] = [];
  const nodes = doc.getElementsByTagNameNS(W, "p");
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    let text = "";
    const parts: Part[] = [];
    const ts = node.getElementsByTagNameNS(W, "t");
    for (let j = 0; j < ts.length; j++) {
      const value = ts[j].textContent ?? "";
      parts.push({ node: ts[j], from: text.length, to: text.length + value.length });
      text += value;
    }
    list.push({ node, text, parts });
  }
  return list;
}

function open(bytes: Uint8Array, tools: XmlTools) {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new NotDocx();
  }
  if (!files[DOCUMENT] || !files["[Content_Types].xml"]) throw new NotDocx();
  const doc = tools.parser.parseFromString(strFromU8(files[DOCUMENT]), "application/xml");
  return { files, doc };
}

export type DocxReading = {
  blanks: { label: string; context: string; paragraph: number; start: number; end: number }[];
  /** Paragraphe sous lequel la signature est posée ; -1 : à la fin du document. */
  signatureParagraph: number;
  signatureText: string;
  title: string;
};

export function readDocx(bytes: Uint8Array, tools: XmlTools = browserTools()): DocxReading {
  const { doc } = open(bytes, tools);
  const texts = paragraphs(doc).map((p) => p.text);
  const signatureParagraph = findSignatureLine(texts);
  return {
    blanks: findBlanks(texts).map((b) => ({ label: b.label, context: b.context, paragraph: b.line, start: b.spot.start, end: b.spot.end })),
    signatureParagraph,
    signatureText: signatureParagraph >= 0 ? texts[signatureParagraph].trim() : "",
    title: texts.find((t) => t.trim().length > 3)?.trim().slice(0, 120) ?? "",
  };
}

/** Remplace les caractères [start, end) du paragraphe par `value`, sans toucher à la mise en forme. */
function replaceInParagraph(paragraph: Paragraph, start: number, end: number, value: string) {
  let written = false;
  for (const part of paragraph.parts) {
    const text = part.node.textContent ?? "";
    // Case en fin de paragraphe (« Nom : ») : la valeur va au bout du dernier morceau.
    const atEnd = start === end && part === paragraph.parts.at(-1) && end >= part.to;
    if (!atEnd && (part.to <= start || part.from >= end)) continue;
    const cutFrom = Math.max(0, start - part.from);
    const cutTo = Math.min(text.length, end - part.from);
    const insert = written ? "" : `${atEnd && !text.endsWith(" ") ? " " : ""}${value}`;
    part.node.textContent = atEnd ? text + insert : text.slice(0, cutFrom) + insert + text.slice(cutTo);
    part.node.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve");
    written = true;
  }
}

export type DocxFill = { paragraph: number; start: number; end: number; value: string };

/** Taille de la signature dans le Word : 4,5 cm de large. */
const SIGNATURE_EMU = 1_620_000;

export function writeDocx(
  bytes: Uint8Array,
  fills: DocxFill[],
  signature?: { png: Uint8Array; ratio: number; paragraph: number },
  tools: XmlTools = browserTools(),
): Uint8Array {
  const { files, doc } = open(bytes, tools);
  const list = paragraphs(doc);

  // De droite à gauche dans chaque paragraphe : les positions des cases suivantes restent justes.
  const ordered = [...fills].filter((f) => f.value.trim()).sort((a, b) => a.paragraph - b.paragraph || b.start - a.start);
  for (const fill of ordered) {
    const paragraph = list[fill.paragraph];
    if (paragraph) replaceInParagraph(paragraph, fill.start, fill.end, fill.value.trim());
  }

  if (signature) {
    const rels = tools.parser.parseFromString(files[DOCUMENT_RELS] ? strFromU8(files[DOCUMENT_RELS]) : `<Relationships xmlns="${RELS}"/>`, "application/xml");
    const used = new Set<string>();
    const relNodes = rels.getElementsByTagNameNS(RELS, "Relationship");
    for (let i = 0; i < relNodes.length; i++) used.add(relNodes[i].getAttribute("Id") ?? "");
    let n = 1;
    while (used.has(`rIdTamilya${n}`)) n++;
    const rId = `rIdTamilya${n}`;
    let media = "media/signature-tamilya.png";
    for (let k = 2; files[`word/${media}`]; k++) media = `media/signature-tamilya-${k}.png`;
    const rel = rels.createElementNS(RELS, "Relationship");
    rel.setAttribute("Id", rId);
    rel.setAttribute("Type", IMAGE_REL);
    rel.setAttribute("Target", media);
    rels.documentElement.appendChild(rel);
    files[DOCUMENT_RELS] = strToU8(tools.serializer.serializeToString(rels));
    files[`word/${media}`] = signature.png;

    const types = tools.parser.parseFromString(strFromU8(files["[Content_Types].xml"]), "application/xml");
    const defaults = types.getElementsByTagNameNS(CONTENT_TYPES, "Default");
    let hasPng = false;
    for (let i = 0; i < defaults.length; i++) if (defaults[i].getAttribute("Extension")?.toLowerCase() === "png") hasPng = true;
    if (!hasPng) {
      const png = types.createElementNS(CONTENT_TYPES, "Default");
      png.setAttribute("Extension", "png");
      png.setAttribute("ContentType", "image/png");
      types.documentElement.insertBefore(png, types.documentElement.firstChild);
      files["[Content_Types].xml"] = strToU8(tools.serializer.serializeToString(types));
    }

    const cx = SIGNATURE_EMU;
    const cy = Math.round(SIGNATURE_EMU * signature.ratio);
    const xml =
      `<w:p xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"><w:r><w:drawing>` +
      `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
      `<wp:docPr id="${90_000 + n}" name="Signature"/>` +
      `<a:graphic><a:graphicData uri="${PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
      `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
    const imageParagraph = doc.importNode(tools.parser.parseFromString(xml, "application/xml").documentElement, true) as Element;

    const after = list[signature.paragraph]?.node;
    if (after) {
      // Même alignement que la ligne « Signature » (à droite, centré…).
      const jc = after.getElementsByTagNameNS(W, "jc")[0];
      if (jc) {
        const pPr = doc.createElementNS(W, "w:pPr");
        pPr.appendChild(jc.cloneNode(true));
        imageParagraph.insertBefore(pPr, imageParagraph.firstChild);
      }
      after.parentNode?.insertBefore(imageParagraph, after.nextSibling);
    } else {
      // Pas de « Signature » écrit : à la fin, avant les réglages de page (w:sectPr).
      const body = doc.getElementsByTagNameNS(W, "body")[0];
      const sect = body ? Array.from(body.childNodes).find((c) => (c as Element).localName === "sectPr") : undefined;
      if (body) body.insertBefore(imageParagraph, sect ?? null);
    }
  }

  files[DOCUMENT] = strToU8(tools.serializer.serializeToString(doc));
  const zippable: Zippable = {};
  for (const [name, data] of Object.entries(files)) zippable[name] = data;
  return zipSync(zippable, { level: 6 });
}

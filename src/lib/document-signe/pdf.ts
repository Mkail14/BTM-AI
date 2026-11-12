import { PDFDocument, PDFTextField, StandardFonts, rgb } from "pdf-lib";
import { pdfText } from "@/lib/attestation/pdf";
import { findBlanks, findSignatureLine } from "./blanks";

/**
 * PDF ouvert, rempli et signé dans le navigateur : le document ne quitte pas l'appareil.
 * pdf.js lit le texte et sa place sur la page ; pdf-lib écrit par-dessus.
 * Module côté navigateur uniquement.
 */

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Le « worker » est copié avec sa version dans l'adresse (scripts/copy-vad.mjs).
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`;
  return pdfjs;
}

type TextItem = { str: string; transform: number[]; width: number; hasEOL?: boolean };

/** Morceau de texte placé : ses caractères [from, to) dans la ligne, sa place sur la page. */
type Piece = { from: number; to: number; x: number; width: number };

export type PdfLine = { page: number; text: string; y: number; size: number; pieces: Piece[] };

/** Place d'une case sur la page (unités du PDF, origine en bas à gauche). */
export type PdfSpot = { page: number; x: number; y: number; size: number; room: number; field?: string };

export type PdfFillBlank = { label: string; context: string; spot: PdfSpot };

/** Signature : coin haut gauche et largeur, en unités du PDF ; la hauteur suit l'image. */
export type PdfPlace = { page: number; x: number; top: number; width: number };

export type PdfReading = {
  pages: { width: number; height: number }[];
  blanks: PdfFillBlank[];
  signature: PdfPlace;
  /** Pas de texte du tout : un scan (des photos de pages). */
  scanned: boolean;
  title: string;
};

export class PdfLocked extends Error {}

const SIGNATURE_WIDTH = 150;
const SIDE = 36;

/** Les morceaux d'une page remis en lignes, de haut en bas, de gauche à droite. */
function toLines(items: TextItem[], page: number): PdfLine[] {
  const rows: { y: number; size: number; items: TextItem[] }[] = [];
  for (const item of items) {
    if (!item.str) continue;
    const [, , , scale, , y] = item.transform;
    const size = Math.abs(scale) || 10;
    const row = rows.find((r) => Math.abs(r.y - y) < Math.max(2, size * 0.4));
    if (row) row.items.push(item);
    else rows.push({ y, size, items: [item] });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => {
    row.items.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = "";
    const pieces: Piece[] = [];
    let lastEnd = -Infinity;
    for (const item of row.items) {
      const x = item.transform[4];
      // Un vrai écart entre deux morceaux : une espace, pour ne pas coller deux mots.
      if (text && x - lastEnd > row.size * 0.2 && !text.endsWith(" ")) text += " ";
      pieces.push({ from: text.length, to: text.length + item.str.length, x, width: item.width });
      text += item.str;
      lastEnd = x + item.width;
    }
    return { page, text, y: row.y, size: row.size, pieces };
  });
}

/** Largeur relative d'un texte (lettres de Helvetica) : un « m » prend plus de place qu'un point. */
type Measure = (text: string) => number;

/** Abscisse du caractère n° `index` de la ligne (à la fin de la ligne si on la dépasse). */
function xAt(line: PdfLine, index: number, measure: Measure) {
  for (const p of line.pieces) {
    if (index < p.from || index >= p.to) continue;
    const piece = line.text.slice(p.from, p.to);
    const all = measure(piece);
    const share = all > 0 ? measure(piece.slice(0, index - p.from)) / all : (index - p.from) / Math.max(1, p.to - p.from);
    return p.x + p.width * share;
  }
  const last = line.pieces.at(-1);
  return last ? last.x + last.width : 0;
}

/** Lit le PDF : cases à remplir, place de la signature, taille des pages. */
export async function readPdf(bytes: Uint8Array): Promise<PdfReading> {
  const pdfjs = await loadPdfjs();
  let doc;
  try {
    doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") throw new PdfLocked();
    throw error;
  }
  const pages: PdfReading["pages"] = [];
  const lines: PdfLine[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const [x0, y0, x1, y1] = page.view;
    pages.push({ width: x1 - x0, height: y1 - y0 });
    const content = await page.getTextContent();
    lines.push(...toLines(content.items.filter((i) => "str" in i) as TextItem[], n - 1));
  }
  await doc.destroy();

  const texts = lines.map((l) => l.text);
  const title = texts.find((t) => t.trim().length > 3)?.trim().slice(0, 120) ?? "";
  const pageWidth = (page: number) => pages[page]?.width ?? 595;

  const metrics = await (await PDFDocument.create()).embedFont(StandardFonts.Helvetica);
  const widths = new Map<string, number>();
  const charWidth = (c: string) => {
    let w = widths.get(c);
    if (w === undefined) {
      try {
        w = metrics.widthOfTextAtSize(c, 10);
      } catch {
        // Caractère inconnu de Helvetica : une largeur moyenne.
        w = 5;
      }
      widths.set(c, w);
    }
    return w;
  };
  const measure: Measure = (text) => [...text].reduce((sum, c) => sum + charWidth(c), 0);
  let blanks: PdfFillBlank[] = findBlanks(texts).map((b) => {
    const line = lines[b.line];
    const x = b.spot.start === b.spot.end ? xAt(line, b.spot.start, measure) + 4 : xAt(line, b.spot.start, measure);
    const end = b.spot.start === b.spot.end ? pageWidth(line.page) - SIDE : xAt(line, b.spot.end, measure);
    return { label: b.label, context: b.context, spot: { page: line.page, x, y: line.y, size: line.size, room: Math.max(30, end - x) } };
  });

  // Vrai formulaire PDF (cases cliquables) : on remplit ses cases à lui.
  const formBlanks = await readFormFields(bytes, lines);
  if (formBlanks.length) blanks = formBlanks;

  const signatureLine = findSignatureLine(texts);
  const last = pages.length - 1;
  let signature: PdfPlace;
  if (signatureLine >= 0) {
    const line = lines[signatureLine];
    const x = Math.min(line.pieces[0]?.x ?? SIDE, pageWidth(line.page) - SIGNATURE_WIDTH - SIDE);
    // Juste sous le mot « Signature », là où la place est laissée.
    signature = { page: line.page, x, top: Math.max(SIDE + 60, line.y - 8), width: SIGNATURE_WIDTH };
  } else {
    // Rien d'écrit : en bas à droite de la dernière page, là où l'on signe d'habitude.
    signature = { page: last, x: pageWidth(last) - SIGNATURE_WIDTH - SIDE * 1.5, top: SIDE * 2 + 70, width: SIGNATURE_WIDTH };
  }

  return { pages, blanks, signature, scanned: lines.length === 0, title };
}

/** Cases d'un formulaire PDF, avec le texte écrit juste à leur gauche comme libellé. */
async function readFormFields(bytes: Uint8Array, lines: PdfLine[]): Promise<PdfFillBlank[]> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } catch {
    return [];
  }
  const pageRefs = pdf.getPages().map((p) => p.ref);
  const blanks: PdfFillBlank[] = [];
  for (const field of pdf.getForm().getFields()) {
    if (!(field instanceof PDFTextField) || field.isReadOnly()) continue;
    const widget = field.acroField.getWidgets()[0];
    if (!widget) continue;
    const rect = widget.getRectangle();
    const pageRef = widget.P();
    const page = Math.max(0, pageRefs.findIndex((ref) => ref === pageRef));
    const near = lines
      .filter((l) => l.page === page && l.y >= rect.y - 4 && l.y <= rect.y + rect.height + 4)
      .map((l) => ({ l, cut: l.pieces.filter((p) => p.x + p.width <= rect.x + 2).at(-1) }))
      .find((n) => n.cut);
    const before = near?.cut ? near.l.text.slice(0, near.cut.to).replace(/[\s:._…]+$/, "") : "";
    const label = before.split(/\s{2,}|\t/).at(-1)?.slice(-48).trim() || field.getName().replace(/[_.]+/g, " ").trim();
    if (/signature/i.test(label) || /signature/i.test(field.getName())) continue;
    blanks.push({
      label,
      context: near?.l.text ?? label,
      spot: { page, x: rect.x + 2, y: rect.y + rect.height * 0.3, size: Math.min(10, rect.height * 0.7), room: rect.width - 4, field: field.getName() },
    });
  }
  return blanks;
}

/** Dessine la page n° `page` dans le canevas, à la largeur donnée. */
export async function renderPdfPage(bytes: Uint8Array, page: number, canvas: HTMLCanvasElement, width: number) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  try {
    const p = await doc.getPage(page + 1);
    const base = p.getViewport({ scale: 1 });
    const ratio = window.devicePixelRatio || 1;
    const viewport = p.getViewport({ scale: (width / base.width) * ratio });
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${(width * base.height) / base.width}px`;
    await p.render({ canvas, viewport }).promise;
  } finally {
    await doc.destroy();
  }
}

export type PdfFill = { spot: PdfSpot; value: string };

/** Écrit les valeurs et pose la signature ; renvoie le nouveau PDF. */
export async function writePdf(bytes: Uint8Array, fills: PdfFill[], signature?: { png: Uint8Array; place: PdfPlace; ratio: number }) {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const pages = pdf.getPages();
  const form = pdf.getForm();

  for (const { spot, value } of fills) {
    const text = pdfText(value);
    if (!text) continue;
    if (spot.field) {
      try {
        form.getTextField(spot.field).setText(text);
        continue;
      } catch {
        // Case illisible pour pdf-lib : le texte est écrit à sa place, par-dessus.
      }
    }
    const page = pages[spot.page];
    if (!page) continue;
    let size = Math.min(11, Math.max(7, spot.size));
    while (size > 6 && font.widthOfTextAtSize(text, size) > spot.room) size -= 0.5;
    page.drawText(text, { x: spot.x + 2, y: spot.y + 1, size, font, color: rgb(0, 0, 0.35) });
  }
  if (fills.some((f) => f.spot.field)) {
    try {
      form.updateFieldAppearances(font);
    } catch {
      // Les cases gardent l'apparence que leur donne le lecteur PDF.
    }
  }

  if (signature) {
    const page = pages[signature.place.page];
    if (page) {
      const image = await pdf.embedPng(signature.png);
      const { x, top, width } = signature.place;
      const height = width * signature.ratio;
      page.drawImage(image, { x, y: top - height, width, height });
    }
  }
  return pdf.save();
}

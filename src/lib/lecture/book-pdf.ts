import { chunkParagraphs, isSkippedPart, pagesToParagraphs, runningLines, titleFromFileName, cleanText, type BookChapter, type PdfLine, type StoredBook } from "./book";

/**
 * Sort le texte d'un livre en PDF, dans le téléphone (pdf.js) : rien n'est envoyé au serveur, le
 * livre reste à la personne. Les parties viennent de la table des matières du PDF (ses signets) ;
 * sans elle, le livre est coupé en parties de 15 pages. Module côté navigateur uniquement.
 *
 * Un PDF scanné (des photos de pages, sans texte) n'est pas lisible ici.
 */

/** Pages par partie quand le PDF n'a pas de table des matières. */
const PAGES_PER_PART = 15;

type Progress = (done: number, total: number) => void;

async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Le « worker » est copié avec sa version dans l'adresse (scripts/copy-vad.mjs).
  pdfjs.GlobalWorkerOptions.workerSrc = `/pdfjs/${pdfjs.version}/pdf.worker.min.mjs`;
  return pdfjs;
}

type TextItem = { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean };

/** Les morceaux de texte d'une page, remis en lignes (de haut en bas). */
function toLines(items: TextItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  let current: PdfLine | null = null;
  for (const item of items) {
    const [, , , scale, x, y] = item.transform;
    const size = Math.abs(scale) || item.height;
    if (item.str && (!current || Math.abs(current.y - y) > size * 0.5)) {
      if (current) lines.push(current);
      current = { text: "", x, y, size, end: x };
    }
    if (current && item.str) {
      current.text += item.str;
      current.size = Math.max(current.size, item.str.trim() ? size : 0);
      current.end = Math.max(current.end, x + item.width);
    }
    if (item.hasEOL && current) {
      lines.push(current);
      current = null;
    }
  }
  if (current) lines.push(current);
  return lines.filter((line) => line.text.trim());
}

type Part = { title: string; from: number; to: number };

/** Parties du livre d'après ses signets (premier niveau), chacune de sa page de début à la veille de la suivante. */
async function outlineParts(pdf: import("pdfjs-dist").PDFDocumentProxy): Promise<Part[]> {
  const outline = await pdf.getOutline().catch(() => null);
  if (!outline?.length) return [];
  const starts: { title: string; page: number }[] = [];
  for (const item of outline) {
    try {
      const dest = typeof item.dest === "string" ? await pdf.getDestination(item.dest) : item.dest;
      if (!dest?.[0]) continue;
      const page = typeof dest[0] === "number" ? dest[0] : await pdf.getPageIndex(dest[0]);
      starts.push({ title: cleanText(item.title), page: page + 1 });
    } catch {
      // Signet cassé : ignoré.
    }
  }
  starts.sort((a, b) => a.page - b.page);
  return starts.map((s, i) => ({ title: s.title, from: s.page, to: (starts[i + 1]?.page ?? pdf.numPages + 1) - 1 })).filter((p) => p.to >= p.from);
}

/** Lit le PDF entier et le range en parties et morceaux. Lève une erreur lisible si le PDF n'a pas de texte. */
export async function readPdfBook(file: File, onProgress?: Progress): Promise<StoredBook> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  try {
    const pages: PdfLine[][] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      pages.push(toLines(content.items.filter((item) => "str" in item) as TextItem[]));
      page.cleanup();
      if (n % 10 === 0 || n === pdf.numPages) onProgress?.(n, pdf.numPages);
    }
    const letters = pages.flat().reduce((n, line) => n + line.text.length, 0);
    if (letters < pdf.numPages * 50) throw new Error("Ce PDF ne contient pas de texte (des pages photographiées) : je ne peux pas encore le lire.");

    let parts = await outlineParts(pdf);
    if (!parts.length) {
      parts = [];
      for (let from = 1; from <= pdf.numPages; from += PAGES_PER_PART) {
        parts.push({ title: `Partie ${parts.length + 1}`, from, to: Math.min(pdf.numPages, from + PAGES_PER_PART - 1) });
      }
    }
    const skip = runningLines(pages);
    const chapters: BookChapter[] = parts
      .filter((part) => !isSkippedPart(part.title))
      .map((part) => ({ title: part.title, chunks: chunkParagraphs(pagesToParagraphs(pages.slice(part.from - 1, part.to), skip)) }))
      .filter((chapter) => chapter.chunks.length);
    if (!chapters.length) throw new Error("Je n'ai trouvé aucun texte à lire dans ce PDF.");

    const info = (await pdf.getMetadata().catch(() => null))?.info as { Title?: string } | undefined;
    const title = cleanText(info?.Title ?? "").slice(0, 120) || titleFromFileName(file.name);
    return { id: crypto.randomUUID(), title, addedAt: Date.now(), pages: pdf.numPages, chapters };
  } finally {
    void pdf.destroy();
  }
}

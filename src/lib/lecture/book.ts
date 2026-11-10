import { z } from "zod";
import { GEMINI_VOICES } from "@/lib/ai/voice/voices";
import { BOOK_CAST, PLACES, type KnownCharacter, type ScenePlace } from "./script";

/**
 * Livre lu en entier par Tamilya (un PDF de plusieurs centaines de pages). Le texte est sorti du
 * PDF dans le téléphone (book-pdf.ts), remis en paragraphes ici, puis coupé en morceaux qu'une
 * seule mise en scène Gemini peut recopier (/api/lecture, 60 répliques au plus). Les morceaux
 * s'enchaînent sans coupure : chacun reçoit la mémoire du précédent (BookMemory).
 *
 * Code commun au téléphone et au serveur : rien qui dépende du navigateur ici.
 */

/** Un morceau : ~4 minutes d'écoute, et assez court pour que Gemini le recopie en entier. */
export const BOOK_CHUNK_CHARS = 4_000;

/** Une ligne de texte d'une page du PDF : position (en points, y vers le haut), taille de lettre, fin de ligne. */
export type PdfLine = { text: string; x: number; y: number; size: number; end: number };

export type BookChapter = { title: string; chunks: string[] };
export type StoredBook = { id: string; title: string; addedAt: number; pages: number; chapters: BookChapter[] };

/** Ce que Tamilya garde d'un morceau à l'autre : les voix des personnages, le décor, où on en est. */
export type BookMemory = { resume: string; personnages: KnownCharacter[]; lieu: ScenePlace | null; musique: string | null; decor: string[] };
/** Marque-page : le morceau en cours (repris depuis son début), avec la mémoire qui a servi à le préparer. done : livre fini. */
export type BookProgress = { chapter: number; chunk: number; memory: BookMemory | null; updatedAt: number; done?: boolean };

export const EMPTY_MEMORY: BookMemory = { resume: "", personnages: [], lieu: null, musique: null, decor: [] };

const voiceIds = GEMINI_VOICES.map((v) => v.id) as [string, ...string[]];

/** Envoyé avec chaque morceau (/api/lecture). */
export const bookContextSchema = z.object({
  livre: z.string().trim().min(1).max(200),
  chapitre: z.string().trim().max(200).catch(""),
  /** Premier morceau d'un chapitre : Tamilya l'annonce. */
  nouveauChapitre: z.boolean().catch(false),
  /** La personne reprend la lecture au milieu d'un chapitre. */
  reprise: z.boolean().catch(false),
  /** Dernier morceau du livre : Tamilya dit un mot à la fin. */
  fin: z.boolean().catch(false),
  resume: z.string().trim().max(1200).catch(""),
  personnages: z
    .array(
      z.object({
        id: z.string().trim().min(1).max(40),
        nom: z.string().trim().max(60).catch(""),
        genre: z.enum(["homme", "femme"]),
        age: z.enum(["enfant", "jeune", "adulte", "vieux"]),
        voix: z.enum(voiceIds),
      }),
    )
    .max(BOOK_CAST)
    .catch([]),
  lieu: z.enum(PLACES).nullable().catch(null),
  musique: z.string().trim().max(40).nullable().catch(null),
  decor: z.array(z.string().trim().max(40)).max(4).catch([]),
});
export type BookContext = z.infer<typeof bookContextSchema>;

/** Parties sans rien à écouter : on ne les lit pas (la personne peut toujours les ouvrir à la main). */
const SKIPPED = /^(auteur|l'auteur|du même auteur|des mêmes auteurs|bibliographie|remerciements|index|notes?|table|table des matières|sommaire|copyright|crédits|mentions|les éditions|dans la même collection|achevé d'imprimer)\b/i;
export const isSkippedPart = (title: string) => SKIPPED.test(title.trim().replace(/[’]/g, "'"));

/** « n°tre », « phén°mène » : un o mal reconnu dans certains PDF. */
export const cleanText = (text: string) =>
  text
    .replace(/(\p{L})°(\p{L})/gu, "$1o$2")
    .replace(/­/g, "")
    .replace(/[ \t ]+/g, " ")
    .trim();

const mostCommon = (values: number[]) => {
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0] ?? 0;
  for (const [v, n] of counts) if (n > (counts.get(best) ?? 0)) best = v;
  return best;
};

const shape = (text: string) => text.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();

/**
 * Lignes répétées en haut ou en bas de beaucoup de pages (titre courant, numéro de page) : à ne
 * pas lire. Calculé sur tout le livre.
 */
export function runningLines(pages: PdfLine[][]): Set<string> {
  const counts = new Map<string, number>();
  for (const page of pages) {
    const edges = new Set([page[0], page.at(-1)].filter((line) => line !== undefined).map((line) => shape(line.text)));
    for (const edge of edges) counts.set(edge, (counts.get(edge) ?? 0) + 1);
  }
  const min = Math.max(3, pages.length * 0.15);
  return new Set([...counts].filter(([, n]) => n >= min).map(([text]) => text));
}

const PAGE_NUMBER = /^(page\s*)?\d{1,4}(\s*\/\s*\d{1,4})?$/i;
const SENTENCE_END = /[.!?…:»"”)]$/;

/** Recolle deux lignes : un mot coupé en fin de ligne (« inquié- / tantes ») redevient entier. */
function joinLines(left: string, right: string) {
  if (!left) return right;
  if (/\p{L}-$/u.test(left)) return /^\p{Ll}/u.test(right) ? left.slice(0, -1) + right : left + right;
  return `${left} ${right}`;
}

/**
 * Les lignes des pages d'une partie redeviennent des paragraphes : une ligne en retrait, un grand
 * blanc, une ligne courte qui finit une phrase ou un titre (lettres plus grandes) commencent un
 * nouveau paragraphe. Les numéros de page et les titres courants sont enlevés.
 */
export function pagesToParagraphs(pages: PdfLine[][], skip: Set<string> = new Set()): string[] {
  const lines = pages.map((page) => page.filter((line) => line.text.trim() && !PAGE_NUMBER.test(line.text.trim()) && !skip.has(shape(line.text))));
  const all = lines.flat();
  if (!all.length) return [];
  const body = mostCommon(all.map((l) => Math.round(l.size)));
  const bodyLines = all.filter((l) => Math.round(l.size) === body);
  const margin = mostCommon(bodyLines.map((l) => Math.round(l.x)));
  const right = mostCommon(bodyLines.map((l) => Math.round(l.end / 4) * 4));
  const gaps: number[] = [];
  for (const page of lines) for (let i = 1; i < page.length; i++) gaps.push(Math.round(page[i - 1].y - page[i].y));
  const gap = mostCommon(gaps.filter((g) => g > 0)) || body * 1.4;

  const paragraphs: string[] = [];
  let current = "";
  const close = () => {
    const text = cleanText(current);
    if (text) paragraphs.push(text);
    current = "";
  };
  for (const page of lines) {
    let previous: PdfLine | null = null;
    for (const line of page) {
      const heading = line.size > body * 1.15;
      const indented = line.x > margin + body * 0.8;
      const spaced = previous !== null && previous.y - line.y > gap * 1.6;
      const lastEnded = previous !== null && SENTENCE_END.test(previous.text.trim()) && previous.end < right - body * 3;
      if (heading || indented || spaced || lastEnded) close();
      current = joinLines(current, line.text.trim());
      if (heading) close();
      previous = line;
    }
    // Une page qui finit sur un titre ou une phrase courte terminée : le paragraphe s'arrête là.
    if (previous && SENTENCE_END.test(previous.text.trim()) && previous.end < right - body * 3) close();
  }
  close();
  return mendBreaks(paragraphs);
}

/**
 * Une phrase coupée en deux paragraphes (citation en retrait, lettrine, première ligne décalée) :
 * recollée quand le premier ne finit pas une phrase et que le second commence par une minuscule.
 */
export function mendBreaks(paragraphs: string[]): string[] {
  const out: string[] = [];
  for (const paragraph of paragraphs) {
    const last = out.at(-1);
    if (last !== undefined && !/[.!?…:;»"”)\]]$/.test(last) && /^\p{Ll}/u.test(paragraph)) out[out.length - 1] = joinLines(last, paragraph);
    else out.push(paragraph);
  }
  return out;
}

/** Phrases d'un paragraphe trop long pour un seul morceau. */
const sentences = (text: string) => text.split(/(?<=[.!?…»])\s+/);

/** Coupe un texte trop long sans couper un mot. */
function hardSplit(text: string, max: number): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const cut = rest.lastIndexOf(" ", max);
    const at = cut > max / 2 ? cut : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/**
 * Les paragraphes en morceaux d'au plus max caractères, sans couper un paragraphe quand il tient
 * (sinon entre deux phrases). Les paragraphes restent séparés par une ligne vide.
 */
export function chunkParagraphs(paragraphs: string[], max = BOOK_CHUNK_CHARS): string[] {
  const pieces = paragraphs.flatMap((p) => {
    if (p.length <= max) return [p];
    const out: string[] = [];
    let current = "";
    for (const sentence of sentences(p).flatMap((s) => (s.length > max ? hardSplit(s, max) : [s]))) {
      if (current && current.length + 1 + sentence.length > max) {
        out.push(current);
        current = sentence;
      } else current = current ? `${current} ${sentence}` : sentence;
    }
    if (current) out.push(current);
    return out;
  });
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (current && current.length + 2 + piece.length > max) {
      chunks.push(current);
      current = piece;
    } else current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Nom d'un livre d'après son fichier quand le PDF n'en donne pas. */
export const titleFromFileName = (name: string) =>
  name
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Mon livre";

/** Mémoire du livre après un morceau : ce que la mise en scène a rendu (voix des personnages, décor, résumé). */
export function nextMemory(previous: BookMemory, meta: { cast?: KnownCharacter[]; summary?: string; place: ScenePlace; music: string | null; ambiences: { sound: string }[] }): BookMemory {
  return {
    resume: meta.summary || previous.resume,
    personnages: meta.cast ?? previous.personnages,
    lieu: meta.place,
    musique: meta.music,
    decor: meta.ambiences.map((a) => a.sound),
  };
}

/** Position dans le livre, en part de tous les morceaux lus (0 à 1). */
export function bookShare(book: Pick<StoredBook, "chapters">, chapter: number, chunk: number) {
  const total = book.chapters.reduce((n, c) => n + c.chunks.length, 0);
  const before = book.chapters.slice(0, chapter).reduce((n, c) => n + c.chunks.length, 0) + chunk;
  return total ? before / total : 0;
}

/** Morceau suivant (chapitre suivant au besoin) ; null à la fin du livre. */
export function nextChunk(book: Pick<StoredBook, "chapters">, chapter: number, chunk: number): { chapter: number; chunk: number } | null {
  if (chunk + 1 < (book.chapters[chapter]?.chunks.length ?? 0)) return { chapter, chunk: chunk + 1 };
  for (let c = chapter + 1; c < book.chapters.length; c++) if (book.chapters[c].chunks.length) return { chapter: c, chunk: 0 };
  return null;
}

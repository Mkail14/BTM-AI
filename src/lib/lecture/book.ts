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
/**
 * Marque-page : le morceau en cours (repris depuis son début, ou depuis from quand la personne a
 * déplacé la barre), avec la mémoire qui a servi à le préparer. done : livre fini.
 */
export type BookProgress = { chapter: number; chunk: number; from?: number; memory: BookMemory | null; updatedAt: number; done?: boolean };

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

/**
 * Mots composés coupés sur leur trait d'union (« dit- / il », « peut- / être », « grand- / mère ») :
 * le trait reste, sinon la voix lit « ditil » ou « peutêtre ».
 */
const COMPOUND_AFTER =
  /^(?:ci|là|même|mêmes|être|il|ils|elle|elles|on|je|tu|nous|vous|moi|toi|lui|leur|leurs|le|la|les|en|y|t|dire|unes|uns|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|vingt|cent|cents|mille|et)(?![\p{L}'’])/u;
const COMPOUND_BEFORE =
  /(?:^|[\s'’(«"-])(?:grand|grands|grande|grandes|demi|mi|semi|vice|ex|non|arc|avant|après|arrière|au|beau|belle|porte|sans|soi|vis|celui|celle|ceux|celles|peut|est|dit|fait|vingt|trente|quarante|cinquante|soixante|quatre|sous|sur|contre|entre|chef|haut|bas|rond|pot|garde|tire|chou|petit|petite|petits|petites|nord|sud|libre|franc|anglo|gallo|judéo|saint|sainte|états|ouest|là|ci)-$/iu;

/** Recolle deux lignes : un mot coupé en fin de ligne (« inquié- / tantes ») redevient entier. */
function joinLines(left: string, right: string) {
  if (!left) return right;
  if (/\p{L}-$/u.test(left)) return /^\p{Ll}/u.test(right) && !COMPOUND_AFTER.test(right) && !COMPOUND_BEFORE.test(left) ? left.slice(0, -1) + right : left + right;
  // « l' / homme » : l'apostrophe colle au mot suivant.
  if (/\p{L}['’]$/u.test(left)) return left + right;
  // Lettrine : la grande première lettre (« L ») et la suite du mot (« orsque »).
  if (/^\p{Lu}$/u.test(left) && /^\p{Ll}/u.test(right)) return left + right;
  return `${left} ${right}`;
}

/** Abréviations suivies d'un point qui ne finissent pas une phrase (« M. Dupont », « J. K. Rowling », « cf. »). */
const ABBREVIATION = /^(?:\p{Lu}|M|MM|Mme|Mmes|Mlle|Mlles|Mr|Mrs|Dr|Pr|Me|Mgr|St|Ste|Sr|Jr|cf|p|pp|vol|chap|art|av|apr|J\.-C|ibid|op|fig|éd|env|réf)$/u;

/**
 * Débuts de phrase dans un texte (positions) : après . ! ? … (et un guillemet ou une parenthèse
 * qui ferme), suivi d'une majuscule, d'un chiffre, d'un guillemet ou d'un tiret. Jamais au milieu
 * de « « Bonjour ! » dit-il » ni après « M. » : avant, la coupure tombait parfois là, et le
 * morceau suivant commençait par « dit-il. ».
 */
export function sentenceStarts(text: string): number[] {
  const starts: number[] = [];
  for (const match of text.matchAll(/[.!?…]+[»"”’)\]]*\s+/gu)) {
    const end = (match.index ?? 0) + match[0].length;
    if (end >= text.length || !/[\p{Lu}\d«"“—–\-(]/u.test(text[end])) continue;
    if (/^\.(?!\.)/.test(match[0])) {
      const word = text.slice(0, match.index).match(/(\S+)$/)?.[1].replace(/^[^\p{L}]+/u, "") ?? "";
      if (ABBREVIATION.test(word)) continue;
    }
    starts.push(end);
  }
  return starts;
}

/** Les phrases d'un texte, dans l'ordre (voir sentenceStarts). */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (const at of sentenceStarts(text)) {
    out.push(text.slice(from, at).trim());
    from = at;
  }
  const rest = text.slice(from).trim();
  if (rest) out.push(rest);
  return out.filter(Boolean);
}

/**
 * Les lignes des pages d'une partie redeviennent des paragraphes : une ligne en retrait, un grand
 * blanc, une ligne courte qui finit une phrase ou un titre (lettres plus grandes) commencent un
 * nouveau paragraphe. Les numéros de page et les titres courants sont enlevés.
 */
export function pagesToParagraphs(pages: PdfLine[][], skip: Set<string> = new Set()): string[] {
  const kept = pages.map((page) => page.filter((line) => line.text.trim() && !PAGE_NUMBER.test(line.text.trim()) && !skip.has(shape(line.text))));
  if (!kept.flat().length) return [];
  const body = mostCommon(kept.flat().map((l) => Math.round(l.size)));
  // Notes de bas de page (lettres plus petites, sous le texte) : enlevées. Sinon elles tombaient au
  // milieu d'une phrase qui continue sur la page suivante (« il partit vers 1. Voir… la mer »).
  const lines = kept.map((page) => {
    let last = page.length - 1;
    while (last >= 0 && page[last].size < body * 0.88) last--;
    return last >= 0 ? page.slice(0, last + 1) : page;
  });
  const all = lines.flat();
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
      // Après une lettrine, la suite du mot vient à côté (souvent en retrait) : même paragraphe.
      if (/^\p{Lu}$/u.test(current.trim())) {
        current = joinLines(current.trim(), line.text.trim());
        previous = line;
        continue;
      }
      const big = line.size > body * 1.15;
      const dropCap = big && /^\p{Lu}$/u.test(line.text.trim());
      const heading = big && !dropCap;
      const indented = line.x > margin + body * 0.8;
      const spaced = previous !== null && previous.y - line.y > gap * 1.6;
      const lastEnded = previous !== null && SENTENCE_END.test(previous.text.trim()) && previous.end < right - body * 3;
      if (big || indented || spaced || lastEnded) close();
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
    for (const sentence of splitSentences(p).flatMap((s) => (s.length > max ? hardSplit(s, max) : [s]))) {
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

/** Nombre de lettres avant ce morceau (chapitres d'avant compris) : la position dans le livre. */
export function charsBefore(book: Pick<StoredBook, "chapters">, chapter: number, chunk: number) {
  let n = 0;
  for (let c = 0; c < chapter; c++) for (const text of book.chapters[c]?.chunks ?? []) n += text.length;
  for (const text of book.chapters[chapter]?.chunks.slice(0, chunk) ?? []) n += text.length;
  return n;
}

export const bookLength = (book: Pick<StoredBook, "chapters">) => charsBefore(book, book.chapters.length, 0);

/**
 * L'endroit du livre à une position (en lettres) : le morceau, et dans le morceau le début de la
 * phrase la plus proche avant (from), pour ne jamais commencer au milieu d'un mot.
 */
export function bookPlace(book: Pick<StoredBook, "chapters">, at: number): { chapter: number; chunk: number; from: number } {
  let rest = Math.max(0, at);
  let last = { chapter: 0, chunk: 0, from: 0 };
  for (let c = 0; c < book.chapters.length; c++) {
    const chunks = book.chapters[c].chunks;
    for (let k = 0; k < chunks.length; k++) {
      last = { chapter: c, chunk: k, from: 0 };
      if (rest < chunks[k].length) {
        const paragraphs = [...chunks[k].matchAll(/\n\n(?=\S)/g)].map((m) => (m.index ?? 0) + m[0].length);
        const starts = [0, ...paragraphs, ...sentenceStarts(chunks[k])].filter((n) => n <= rest);
        return { chapter: c, chunk: k, from: Math.max(...starts) };
      }
      rest -= chunks[k].length;
    }
  }
  return last;
}

/** Morceau suivant (chapitre suivant au besoin) ; null à la fin du livre. */
export function nextChunk(book: Pick<StoredBook, "chapters">, chapter: number, chunk: number): { chapter: number; chunk: number } | null {
  if (chunk + 1 < (book.chapters[chapter]?.chunks.length ?? 0)) return { chapter, chunk: chunk + 1 };
  for (let c = chapter + 1; c < book.chapters.length; c++) if (book.chapters[c].chunks.length) return { chapter: c, chunk: 0 };
  return null;
}

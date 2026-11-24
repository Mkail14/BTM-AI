import type { RawImage } from "./grid";
import { findZone } from "./zones";

/**
 * Image « villages » du planning de la SMAE : une colonne teintée par secteur (orange, vert, bleu,
 * jaune) avec la liste de ses villages. Ici, sans IA : repérer les colonnes, puis remettre en ordre
 * les lignes lues par la lecture de texte (Tesseract) et les écrire comme sur la carte.
 */

/** Colonnes teintées de l'image (fond pâle coloré), de gauche à droite. */
export function tintedColumns(image: RawImage): { left: number; width: number }[] {
  const { width: W, height: H, channels: C, data } = image;
  const from = Math.round(H * 0.3), to = Math.round(H * 0.95);
  const columns: { start: number; end: number }[] = [];
  for (let x = 0; x < W; x++) {
    let tinted = 0;
    for (let y = from; y < to; y++) {
      const p = (y * W + x) * C;
      const low = Math.min(data[p], data[p + 1], data[p + 2]), high = Math.max(data[p], data[p + 1], data[p + 2]);
      if (low > 170 && high - low > 12) tinted++;
    }
    // Le texte cache une partie du fond : une colonne sur dix teintée suffit ; entre deux secteurs c'est blanc.
    if (tinted < (to - from) * 0.1) continue;
    const last = columns[columns.length - 1];
    if (last && x - last.end <= 6) last.end = x;
    else columns.push({ start: x, end: x });
  }
  return columns.filter((c) => c.end - c.start >= W * 0.08).map((c) => ({ left: c.start, width: c.end - c.start + 1 }));
}

/** Petites erreurs de lecture connues : « Z.l. » → « Z.I. », « Tsoundzou Il » ou « | » → « II », « I ». */
function cleanName(text: string): string {
  return text
    .replace(/^[^\p{L}\d(]+/u, "")
    .replace(/\bZ\s*\.\s*[lI1|]\s*\./g, "Z.I.")
    .replace(/(^|\s)([lI1|]{1,3})(?=\s|$)/g, (_, space: string, roman: string) => space + "I".repeat(roman.length))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lignes lues dans une colonne (texte et position gauche) → villages. Les lignes avant « VILLAGES »
 * (titre, « SECTEUR 01 ») sont sautées ; une ligne plus à droite que les autres suit la précédente
 * (« Convaslescence – Mdz » puis « (100 villas, vertivert) »). Chaque nom est écrit comme sur la
 * carte s'il y est connu (une ou deux lettres mal lues), sinon tel quel.
 */
export function villagesFromLines(lines: { text: string; x: number }[], imageWidth: number): string[] {
  const start = lines.findIndex((l) => /villages/i.test(l.text));
  const body = lines.slice(start + 1).filter((l) => /\p{L}/u.test(l.text));
  if (!body.length) return [];
  const left = Math.min(...body.map((l) => l.x));
  const names: string[] = [];
  for (const line of body) {
    const text = cleanName(line.text);
    if (!text) continue;
    if (line.x - left > imageWidth * 0.012 && names.length) names[names.length - 1] += " " + text;
    else names.push(text);
  }
  return names.map((name) => findZone(name)?.name ?? name);
}

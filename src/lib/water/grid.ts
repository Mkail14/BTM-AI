import type { DayCell } from "./schedule";

/**
 * Lecture d'une image « semaine » du planning de la SMAE, sans IA : seulement les couleurs.
 * Sur chaque image, 7 lignes (lundi → dimanche) et 4 colonnes (secteurs 1 à 4). Dans une case :
 * - texte vert seul → « ouverture » (OUVERTURE 10h) ;
 * - texte vert et rouge → « journee » (OUVERTURE 7h / FERMETURE 17h) ;
 * - texte rouge petit (dans un cadre) → « fermeture » (FERMETURE 16h) ;
 * - texte rouge grand (sans cadre) → « ferme » (FERMÉ).
 * Le gris, le noir (jours, heures) et l'orange ou le bleu des titres ne comptent pas.
 */

/** « Planning des tours d'eau du 23.11.2026 au 13.12.2026 » → première et dernière date. */
export function titleDates(title: string): { from: string; to: string } | null {
  const m = /du\s+(\d{1,2})[./](\d{1,2})[./](\d{4})\s+au\s+(\d{1,2})[./](\d{1,2})[./](\d{4})/i.exec(title);
  if (!m) return null;
  const iso = (d: string, mo: string, y: string) => `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return { from: iso(m[1], m[2], m[3]), to: iso(m[4], m[5], m[6]) };
}

export type RawImage ={ width: number; height: number; channels: number; data: Uint8Array | Buffer };

const isRed = (r: number, g: number, b: number) => r > 170 && g < 90 && b < 90;
const isGreen = (r: number, g: number, b: number) => g > 110 && r < 120 && b < 120 && g - r > 40;

type Range = { start: number; end: number };

/** Plages d'indices où `values[i] >= min`, en fusionnant les trous plus petits que `gap`. */
function ranges(values: number[], min: number, gap: number): Range[] {
  const found: Range[] = [];
  values.forEach((v, i) => {
    if (v < min) return;
    const last = found[found.length - 1];
    if (last && i - last.end <= gap) last.end = i;
    else found.push({ start: i, end: i });
  });
  return found;
}

/** Repère les 4 colonnes et les 7 jours d'une image « semaine » ; null si ce n'en est pas une. */
export function readWeekGrid(image: RawImage): DayCell[][] | null {
  const { width: W, height: H, channels: C, data } = image;
  const kind = new Uint8Array(W * H); // 0 rien, 1 rouge, 2 vert
  for (let i = 0, p = 0; i < W * H; i++, p += C) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    kind[i] = isRed(r, g, b) ? 1 : isGreen(r, g, b) ? 2 : 0;
  }

  // Colonnes : là où il y a du texte coloré sous les titres (le haut de l'image est sauté).
  const top = Math.round(H * 0.25);
  const perX = new Array<number>(W).fill(0);
  for (let y = top; y < H; y++) for (let x = 0; x < W; x++) if (kind[y * W + x]) perX[x]++;
  const columns = ranges(perX, 4, Math.round(W * 0.015)).filter((c) => c.end - c.start >= W * 0.04);
  if (columns.length !== 4) return null;

  // Lignes : une bande de texte coloré présente dans les 4 colonnes à la fois.
  const perY = columns.map(() => new Array<number>(H).fill(0));
  const any = new Array<number>(H).fill(0);
  for (let y = 0; y < H; y++)
    columns.forEach((c, k) => {
      for (let x = c.start; x <= c.end; x++) if (kind[y * W + x]) perY[k][y]++;
      if (perY[k][y] >= 2) any[y]++;
    });
  const bands = ranges(any, 1, Math.round(H * 0.012)).filter((band) =>
    perY.every((col) => col.slice(band.start, band.end + 1).some((n) => n >= 2)),
  );
  if (bands.length !== 7) return null;
  const pitch = (bands[6].start - bands[0].start) / 6;

  return bands.map((band) =>
    columns.map((col): DayCell => {
      let red = 0, green = 0, redTop = Infinity, redBottom = -1;
      for (let y = band.start; y <= band.end; y++)
        for (let x = col.start; x <= col.end; x++) {
          const k = kind[y * W + x];
          if (k === 1) {
            red++;
            redTop = Math.min(redTop, y);
            redBottom = Math.max(redBottom, y);
          } else if (k === 2) green++;
        }
      const hasRed = red >= 30, hasGreen = green >= 30;
      if (hasGreen && hasRed) return "journee";
      if (hasGreen) return "ouverture";
      if (!hasRed) throw new Error("Case vide dans le planning.");
      // FERMÉ est écrit deux fois plus haut que FERMETURE (≈ 0,30 contre 0,15 de l'écart entre deux jours).
      return (redBottom - redTop) / pitch > 0.19 ? "ferme" : "fermeture";
    }),
  );
}

/**
 * Enlève le fond d'une photo de signature sur feuille blanche, dans le navigateur :
 * la signature, donnée personnelle sensible, ne quitte jamais l'appareil.
 *
 * La feuille n'est jamais d'un blanc uniforme sur une photo (ombre, lumière de
 * côté) : sa clarté est mesurée par petites zones, et seul ce qui est nettement
 * plus sombre que la feuille autour devient de l'encre.
 */

export type Pixels = { data: Uint8ClampedArray; width: number; height: number };

export type SignatureProblem = "empty" | "not_white_sheet";

export type SignatureResult = { ok: true; image: Pixels } | { ok: false; problem: SignatureProblem };

const TILE = 32;
/** Écart de clarté avec la feuille : en dessous, c'est du fond ; au-dessus, de l'encre pleine. */
const INK_FROM = 38;
const INK_FULL = 96;
const MARGIN = 8;
/** Moins d'encre : feuille vide. Plus : ce n'est pas une signature sur une feuille blanche. */
const MIN_INK = 0.0004;
const MAX_INK = 0.28;

const lumaAt = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** Clarté de la feuille par zone : presque la plus forte de la zone, pour ignorer les traits d'encre. */
function paperMap({ data, width, height }: Pixels) {
  const cols = Math.ceil(width / TILE);
  const rows = Math.ceil(height / TILE);
  const levels = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const values: number[] = [];
      const endY = Math.min(height, (row + 1) * TILE);
      const endX = Math.min(width, (col + 1) * TILE);
      for (let y = row * TILE; y < endY; y += 2) {
        for (let x = col * TILE; x < endX; x += 2) values.push(lumaAt(data, (y * width + x) * 4));
      }
      values.sort((a, b) => a - b);
      levels[row * cols + col] = values[Math.floor(values.length * 0.9)] ?? 255;
    }
  }
  return { levels, cols, rows };
}

/** Clarté de la feuille à ce pixel (zone voisine la plus claire, pour une zone toute couverte d'encre). */
function paperAt(map: ReturnType<typeof paperMap>, x: number, y: number) {
  const col = Math.floor(x / TILE);
  const row = Math.floor(y / TILE);
  let best = 0;
  for (let r = Math.max(0, row - 1); r <= Math.min(map.rows - 1, row + 1); r++) {
    for (let c = Math.max(0, col - 1); c <= Math.min(map.cols - 1, col + 1); c++) {
      best = Math.max(best, map.levels[r * map.cols + c]);
    }
  }
  return best;
}

export function removeSignatureBackground(source: Pixels): SignatureResult {
  const { width, height, data } = source;
  if (!width || !height) return { ok: false, problem: "empty" };
  const map = paperMap(source);
  const out = new Uint8ClampedArray(data.length);
  let ink = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const paper = paperAt(map, x, y);
      const gap = paper - lumaAt(data, i);
      if (gap <= INK_FROM) continue;
      const alpha = Math.min(1, (gap - INK_FROM) / (INK_FULL - INK_FROM));
      // Bord du trait : on retire la part de feuille mêlée à l'encre, sinon un halo clair reste autour.
      for (let c = 0; c < 3; c++) out[i + c] = (data[i + c] - (1 - alpha) * paper) / alpha;
      out[i + 3] = alpha * 255;
      if (alpha < 0.5) continue;
      ink++;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  const share = ink / (width * height);
  if (share < MIN_INK || maxX < 0) return { ok: false, problem: "empty" };
  if (share > MAX_INK) return { ok: false, problem: "not_white_sheet" };

  // Recadrée au plus près de la signature.
  const left = Math.max(0, minX - MARGIN);
  const top = Math.max(0, minY - MARGIN);
  const cropW = Math.min(width, maxX + MARGIN + 1) - left;
  const cropH = Math.min(height, maxY + MARGIN + 1) - top;
  const cropped = new Uint8ClampedArray(cropW * cropH * 4);
  for (let y = 0; y < cropH; y++) {
    const start = ((y + top) * width + left) * 4;
    cropped.set(out.subarray(start, start + cropW * 4), y * cropW * 4);
  }
  return { ok: true, image: { data: cropped, width: cropW, height: cropH } };
}

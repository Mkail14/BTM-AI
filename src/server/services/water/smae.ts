import "server-only";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { readWeekGrid, titleDates, type RawImage } from "@/lib/water/grid";
import { readPlanning, type DayCell, type WaterPlanning } from "@/lib/water/schedule";
import { tintedColumns, villagesFromLines } from "@/lib/water/villages";
import { readStoredPlanning, savePlanning } from "./store";

/**
 * Lecture du planning officiel des tours d'eau sur le site de la SMAE (mahoraisedeseaux.com).
 * La SMAE le publie en images (une liste des villages par secteur, puis une image par semaine).
 * Lecture sans IA : couleurs des cases (src/lib/water/grid.ts) et lecture de texte des villages
 * (Tesseract, sur le serveur). Le tableau obtenu sert tel quel à la carte et à Tamilya (la carte
 * dit que les données viennent de la SMAE). Vérifié toutes les heures par GitHub (/api/cron/eau).
 */

const SITE = "https://www.mahoraisedeseaux.com";
const MAX_IMAGES = 8;
const MAX_IMAGE_BYTES = 4_000_000;
const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; BTM-AI/1.0)" };

const decode = (text: string) =>
  text
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (!response.ok) throw new Error(`Le site de la SMAE répond ${response.status} (${url}).`);
  return response.text();
}

/** Page du dernier planning annoncé sur l'accueil de la SMAE. */
export async function findPlanningPage(): Promise<{ url: string; title: string }> {
  const home = await fetchText(SITE + "/");
  const block = /titreActuUrgent">([^<]*tours d[^<]*)<\/h2>[\s\S]{0,1500}?href="(\/article\/article\/\d+)"/i.exec(home);
  if (block) return { title: decode(block[1]), url: SITE + block[2] };
  // Sinon : le premier lien d'article dont le texte parle des tours d'eau.
  const link = /href="(\/article\/article\/\d+)"[^>]*>(?:(?!<\/a>)[\s\S]){0,400}?tours d/i.exec(home);
  if (link) return { title: "Planning des tours d'eau", url: SITE + link[1] };
  throw new Error("Aucun planning des tours d'eau annoncé sur l'accueil de la SMAE.");
}

/** Images publiées dans la page du planning. */
export function planningImages(html: string): string[] {
  const found = [...html.matchAll(/src="([^"]*\/uploads\/[^"]+\.(?:jpe?g|png|webp))"/gi)].map((m) => (m[1].startsWith("http") ? m[1] : SITE + m[1]));
  return [...new Set(found)].slice(0, MAX_IMAGES);
}

const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Image téléchargée, en pixels bruts (rouge, vert, bleu). */
async function loadImage(url: string): Promise<RawImage> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Image du planning illisible (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Image du planning trop lourde.");
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: info.channels, data };
}

/** Villages de chaque secteur, lus dans l'image « villages » (lecture de texte Tesseract). */
export async function readVillages(image: RawImage): Promise<string[][]> {
  const columns = tintedColumns(image);
  if (columns.length !== 4) throw new Error(`Image des villages : ${columns.length} colonnes trouvées au lieu de 4.`);
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("fra", 1, { cachePath: tmpdir() });
  try {
    const result: string[][] = [];
    for (const column of columns) {
      const png = await sharp(image.data, { raw: { width: image.width, height: image.height, channels: image.channels as 3 } })
        .extract({ left: column.left, top: 0, width: column.width, height: image.height })
        .png()
        .withMetadata({ density: 150 })
        .toBuffer();
      const { data } = await worker.recognize(png, {}, { blocks: true });
      const lines = (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text.trim(), x: l.bbox.x0 }))));
      result.push(villagesFromLines(lines, image.width));
    }
    return result;
  } finally {
    await worker.terminate();
  }
}

/**
 * Lit le planning de cette page de la SMAE, sans IA : les dates dans le titre de la page, les cases
 * de chaque semaine par leurs couleurs, les villages par lecture de texte. Si les villages ne se
 * lisent pas, ceux du planning déjà en service sont gardés (la liste change rarement).
 */
export async function readSmaePlanning(page: { url: string; title: string }): Promise<WaterPlanning> {
  const dates = titleDates(page.title);
  if (!dates) throw new Error(`Dates introuvables dans le titre « ${page.title} ».`);
  const images = planningImages(await fetchText(page.url));
  if (!images.length) throw new Error(`Pas d'image de planning dans la page de la SMAE (${page.url}).`);

  const weeks: DayCell[][][] = [];
  let villagesImage: RawImage | null = null;
  for (const url of images) {
    const image = await loadImage(url);
    const week = readWeekGrid(image);
    if (week) weeks.push(week);
    else villagesImage ??= image;
  }
  const rows = weeks.flat();
  const expected = Math.round((Date.parse(dates.to) - Date.parse(dates.from)) / 86_400_000) + 1;
  if (rows.length !== expected) throw new Error(`${rows.length} jours lus dans les images, ${expected} annoncés dans le titre.`);

  let villages: string[][] | null = null;
  if (villagesImage)
    villages = await readVillages(villagesImage).catch((error: unknown) => {
      console.error("[eau] Villages illisibles", error);
      return null;
    });
  if (!villages || villages.some((list) => !list.length)) {
    const current = await readStoredPlanning().catch(() => null);
    if (!current) throw new Error("Villages des secteurs illisibles et aucun planning précédent.");
    villages = ["1", "2", "3", "4"].map((id) => current.sectors.find((s) => s.id === id)?.villages ?? []);
  }

  const planning = readPlanning({
    ...dates,
    sectors: villages.map((list, i) => ({ id: String(i + 1), villages: list })),
    days: rows.map((cells, i) => ({ date: addDays(dates.from, i), cells: Object.fromEntries(cells.map((cell, k) => [String(k + 1), cell])) })),
    source: page.url,
    title: page.title,
    images,
    readAt: new Date().toISOString(),
  });
  if (!planning) throw new Error("Planning lu incomplet.");
  return planning;
}

/**
 * Regarde l'accueil de la SMAE ; si un autre planning y est annoncé que celui qu'on a (autre page
 * ou autre titre), le lit et le met en service. `force` : relit même si rien n'a changé.
 */
export async function refreshWaterPlanning({ force = false } = {}): Promise<{ changed: boolean; planning: WaterPlanning | null; title: string }> {
  const page = await findPlanningPage();
  const current = await readStoredPlanning();
  if (!force && current && current.source === page.url && current.title === page.title) return { changed: false, planning: current, title: page.title };
  const planning = await readSmaePlanning(page);
  await savePlanning(planning);
  return { changed: true, planning, title: page.title };
}

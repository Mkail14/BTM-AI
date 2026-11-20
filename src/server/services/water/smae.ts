import "server-only";
import { geminiHeaders, geminiRoot, listKeyModels } from "@/server/services/ai/providers/gemini";
import { geminiKey } from "@/server/services/ai/voice/gemini-tts";
import { DAY_CELLS, readPlanning, type DayCell, type WaterPlanning } from "@/lib/water/schedule";
import { readStoredPlanning, savePlanning } from "./store";

/**
 * Lecture du planning officiel des tours d'eau sur le site de la SMAE (mahoraisedeseaux.com).
 * La SMAE le publie en images (une liste des villages par secteur, puis une image par semaine) :
 * Gemini les lit et en tire un tableau, utilisé tel quel par la carte (la carte dit que les
 * données viennent de la SMAE). Vérifié toutes les heures par GitHub (/api/cron/eau).
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

const PROMPT = `Ces images sont le planning officiel des tours d'eau de la SMAE (Mayotte).
Recopie-le exactement, sans rien inventer :
- from / to : premier et dernier jour couverts (AAAA-MM-JJ) ;
- sectors : chaque secteur (id = son numéro sans zéro : « 1 », « 2 »…) et la liste de ses villages, écrits exactement comme sur l'image (mêmes accents, mêmes parenthèses) ;
- days : chaque jour de la période, avec pour chaque secteur sa case :
  « ouverture » (OUVERTURE 10h), « fermeture » (FERMETURE 16h), « ferme » (FERMÉ toute la journée), « journee » (OUVERTURE 7h et FERMETURE 17h le même jour).
Si une case ne se lit pas, ne la mets pas.`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    from: { type: "STRING" },
    to: { type: "STRING" },
    sectors: { type: "ARRAY", items: { type: "OBJECT", properties: { id: { type: "STRING" }, villages: { type: "ARRAY", items: { type: "STRING" } } }, required: ["id", "villages"] } },
    days: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: { type: "STRING" },
          cells: { type: "ARRAY", items: { type: "OBJECT", properties: { sector: { type: "STRING" }, cell: { type: "STRING", enum: [...DAY_CELLS] } }, required: ["sector", "cell"] } },
        },
        required: ["date", "cells"],
      },
    },
  },
  required: ["from", "to", "sectors", "days"],
};

type Read = { from: string; to: string; sectors: { id: string; villages: string[] }[]; days: { date: string; cells: { sector: string; cell: DayCell }[] }[] };

async function imagePart(url: string) {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Image du planning illisible (${response.status}).`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Image du planning trop lourde.");
  const mimeType = /\.png$/i.test(url) ? "image/png" : /\.webp$/i.test(url) ? "image/webp" : "image/jpeg";
  return { inlineData: { mimeType, data: bytes.toString("base64") } };
}

/** Lit le planning de cette page de la SMAE avec Gemini. Erreur lisible si quelque chose manque. */
export async function readSmaePlanning(page: { url: string; title: string }): Promise<WaterPlanning> {
  const images = planningImages(await fetchText(page.url));
  if (!images.length) throw new Error(`Pas d'image de planning dans la page de la SMAE (${page.url}).`);
  const parts = [...(await Promise.all(images.map(imagePart))), { text: PROMPT }];

  const key = await geminiKey();
  const available = await listKeyModels(key, AbortSignal.timeout(15_000)).catch(() => [] as string[]);
  const version = (id: string) => Number(id.match(/^gemini-([\d.]+)/)?.[1] ?? 0);
  // Lecture d'un tableau : un modèle Pro d'abord (plus sûr), Flash ensuite.
  const models = [
    ...available.filter((id) => /^gemini-[\d.]+-pro$/.test(id)).sort((a, b) => version(b) - version(a)).slice(0, 1),
    ...available.filter((id) => /^gemini-[\d.]+-flash$/.test(id)).sort((a, b) => version(b) - version(a)).slice(0, 2),
  ];
  let lastError = "Gemini n'a pas répondu.";
  // Liste des modèles illisible : on tente quand même les Flash connus (le 2.5 est fermé aux nouvelles clés).
  for (const model of models.length ? models : ["gemini-3.8-flash", "gemini-2.5-flash"]) {
    const response = await fetch(`${geminiRoot(key.baseUrl)}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: geminiHeaders(key.apiKey),
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0, maxOutputTokens: 16_384, responseMimeType: "application/json", responseSchema: SCHEMA },
      }),
      signal: AbortSignal.timeout(120_000),
    }).catch((error: unknown) => {
      lastError = error instanceof Error ? error.message : String(error);
      return null;
    });
    if (!response?.ok) {
      if (response) lastError = `Gemini ${model} : ${response.status}`;
      console.error("[eau] Gemini", model, response?.status, (await response?.text().catch(() => ""))?.slice(0, 300));
      continue;
    }
    const body = (await response.json()) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const text = body.candidates?.[0]?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? "").join("") ?? "";
    const read = JSON.parse(text) as Read;
    const planning = readPlanning({
      from: read.from,
      to: read.to,
      sectors: read.sectors?.map((s) => ({ id: s.id.trim().replace(/^0+/, ""), villages: s.villages })),
      days: read.days?.map((d) => ({ date: d.date, cells: Object.fromEntries(d.cells.map((c) => [c.sector.trim().replace(/^0+/, ""), c.cell])) })),
      source: page.url,
      title: page.title,
      images,
      readAt: new Date().toISOString(),
    });
    if (planning) return planning;
    lastError = `Gemini ${model} a rendu un planning incomplet.`;
  }
  throw new Error(lastError);
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

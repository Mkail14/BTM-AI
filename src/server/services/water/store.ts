import "server-only";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { readPlanning, type WaterAlert, type WaterPlanning } from "@/lib/water/schedule";

/**
 * Tours d'eau gardés dans le stockage Supabase (dossier privé « eau ») : le dernier planning de
 * la SMAE tel que lu sur son site (utilisé tel quel par la carte), et les coupures annoncées. Pas de table
 * ni de migration : le dossier se crée tout seul au premier enregistrement.
 */

const BUCKET = "eau";
const FILES = { planning: "planning.json", alertes: "alertes.json" } as const;
const CACHE_MS = 60_000;
let cached: { at: number; planning: WaterPlanning | null; alerts: WaterAlert[] } | null = null;

async function readFile(file: string): Promise<unknown> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Base indisponible.");
  const { data, error } = await admin.storage.from(BUCKET).download(file);
  if (error) {
    const status = (error as { status?: number; statusCode?: string }).status ?? Number((error as { statusCode?: string }).statusCode);
    if (status === 404 || status === 400 || /not.?found/i.test(error.message)) return null;
    throw new Error(`Stockage illisible : ${error.message}`);
  }
  return JSON.parse(await data.text()) as unknown;
}

async function ensureBucket() {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Base indisponible.");
  const { data } = await admin.storage.getBucket(BUCKET);
  if (data) return admin;
  const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 1_000_000, allowedMimeTypes: ["application/json"] });
  if (error && !/exist/i.test(error.message)) throw new Error(`Dossier de l'eau impossible à créer : ${error.message}`);
  return admin;
}

async function writeFile(file: string, value: unknown) {
  const admin = await ensureBucket();
  const body = new Blob([JSON.stringify(value, null, 1)], { type: "application/json" });
  const { error } = await admin.storage.from(BUCKET).upload(file, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
  cached = null;
}

function readAlerts(raw: unknown): WaterAlert[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (a): a is WaterAlert =>
      Boolean(a) && typeof a.id === "string" && Array.isArray(a.places) && typeof a.from === "string" && typeof a.until === "string" && typeof a.note === "string",
  );
}

export const readStoredPlanning = async () => readPlanning(await readFile(FILES.planning));
export const readWaterAlerts = async () => readAlerts(await readFile(FILES.alertes));

export const savePlanning = (planning: WaterPlanning) => writeFile(FILES.planning, planning);

export async function saveWaterAlerts(alerts: WaterAlert[]) {
  // Les coupures finies depuis plus d'un jour sont oubliées.
  const keep = alerts.filter((a) => Date.parse(a.until) > Date.now() - 86_400_000);
  await writeFile(FILES.alertes, keep);
}

/** Planning et coupures annoncées, gardés 1 minute en mémoire. Rien si le stockage ne répond pas. */
export async function loadWater(): Promise<{ planning: WaterPlanning | null; alerts: WaterAlert[] }> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;
  try {
    const [planning, alerts] = await Promise.all([readStoredPlanning(), readWaterAlerts()]);
    cached = { at: Date.now(), planning, alerts };
    return cached;
  } catch (error) {
    console.error("[eau] Stockage illisible", error);
    return cached ?? { planning: null, alerts: [] };
  }
}

import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { BUILTIN_CATALOG, CATALOG_FILE, SOUND_BUCKET, SOUND_MAX_BYTES, mergeCatalog, type CatalogSound, type StoredCatalog } from "./catalog";

/**
 * Catalogue des sons gardé dans le stockage Supabase (dossier public « lecture-sons ») : les
 * fichiers ajoutés depuis /admin/sons et catalogue.json. Pas de table ni de migration : le dossier
 * se crée tout seul au premier ajout. Lu par /api/lecture à chaque histoire (gardé 20 s en mémoire).
 */

const CACHE_MS = 20_000;
let cached: { at: number; catalog: CatalogSound[] } | null = null;

function isStored(value: unknown): value is StoredCatalog {
  return Boolean(value) && typeof value === "object" && typeof (value as StoredCatalog).sons === "object" && (value as StoredCatalog).sons !== null;
}

/** catalogue.json tel qu'il est ; vide s'il n'existe pas encore. Erreur si le stockage ne répond pas. */
export async function readStoredCatalog(): Promise<StoredCatalog> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Base indisponible.");
  const { data, error } = await admin.storage.from(SOUND_BUCKET).download(CATALOG_FILE);
  if (error) {
    // Pas encore de dossier ou de fichier : rien n'a été changé.
    const status = (error as { status?: number; statusCode?: string }).status ?? Number((error as { statusCode?: string }).statusCode);
    if (status === 404 || status === 400 || /not.?found/i.test(error.message)) return { sons: {} };
    throw new Error(`Stockage illisible : ${error.message}`);
  }
  const parsed: unknown = JSON.parse(await data.text());
  return isStored(parsed) ? parsed : { sons: {} };
}

/** Le catalogue du moment pour une histoire. Si le stockage ne répond pas : les sons d'origine. */
export async function loadSoundCatalog(): Promise<CatalogSound[]> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.catalog;
  try {
    const catalog = mergeCatalog(await readStoredCatalog());
    cached = { at: Date.now(), catalog };
    return catalog;
  } catch (error) {
    console.error("[sons] Catalogue illisible, sons d'origine", error);
    return cached?.catalog ?? BUILTIN_CATALOG;
  }
}

async function ensureBucket() {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("Base indisponible.");
  const { data } = await admin.storage.getBucket(SOUND_BUCKET);
  if (data) return admin;
  const { error } = await admin.storage.createBucket(SOUND_BUCKET, {
    public: true,
    fileSizeLimit: SOUND_MAX_BYTES,
    allowedMimeTypes: ["audio/*", "video/webm", "application/json"],
  });
  if (error && !/exist/i.test(error.message)) throw new Error(`Dossier des sons impossible à créer : ${error.message}`);
  return admin;
}

export async function writeStoredCatalog(stored: StoredCatalog) {
  const admin = await ensureBucket();
  const body = new Blob([JSON.stringify(stored, null, 1)], { type: "application/json" });
  const { error } = await admin.storage.from(SOUND_BUCKET).upload(CATALOG_FILE, body, { upsert: true, contentType: "application/json", cacheControl: "0" });
  if (error) throw new Error(`Enregistrement impossible : ${error.message}`);
  cached = null;
}

/** Adresse d'envoi à usage unique : le navigateur envoie le fichier directement au stockage (pas de limite de taille du serveur). */
export async function createSoundUpload(path: string) {
  const admin = await ensureBucket();
  const { data, error } = await admin.storage.from(SOUND_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw new Error(`Envoi impossible : ${error?.message ?? "pas d'adresse"}`);
  return { path: data.path, token: data.token };
}

/** Vérifie qu'un fichier envoyé est bien arrivé, et qu'il n'est pas trop lourd. */
export async function checkSoundFile(path: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const slash = path.lastIndexOf("/");
  const { data } = await admin.storage.from(SOUND_BUCKET).list(path.slice(0, slash), { search: path.slice(slash + 1), limit: 1 });
  const file = data?.find((f) => f.name === path.slice(slash + 1));
  const size = Number((file?.metadata as { size?: number } | undefined)?.size ?? 0);
  if (file && size > SOUND_MAX_BYTES) {
    await removeSoundFile(path);
    return false;
  }
  return Boolean(file);
}

export async function removeSoundFile(path: string | null | undefined) {
  if (!path) return;
  const admin = getSupabaseAdminClient();
  await admin?.storage.from(SOUND_BUCKET).remove([path]);
}

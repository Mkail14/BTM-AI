"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { BUILTIN_CATALOG, SOUND_ID, type StoredSound } from "@/lib/lecture/catalog";
import { checkSoundFile, createSoundUpload, readStoredCatalog, removeSoundFile, writeStoredCatalog } from "@/lib/lecture/catalog-store";

/**
 * Sons de Tamilya (/admin/sons) : brancher, débrancher, renommer, remplacer le fichier, ajouter.
 * Tout est gardé dans catalogue.json (catalog-store.ts) ; les histoires suivantes en tiennent compte.
 */

const isBuiltin = (id: string) => BUILTIN_CATALOG.some((s) => s.id === id);
const AUDIO_EXT = /^(webm|ogg|opus|mp3|m4a|aac|wav)$/;
/** Seuls les fichiers envoyés par cette page sont acceptés comme son. */
const FILE_PATH = /^fichiers\/[a-z0-9-]+-\d+\.(webm|ogg|opus|mp3|m4a|aac|wav)$/;

async function change(edit: (sons: Record<string, StoredSound>) => string | null): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  try {
    const stored = await readStoredCatalog();
    const problem = edit(stored.sons);
    if (problem) return { ok: false, message: problem };
    await writeStoredCatalog(stored);
    revalidatePath("/admin/sons");
    return { ok: true, message: "Enregistré : Tamilya s'en sert dès la prochaine histoire." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Enregistrement impossible." };
  }
}

const toggleSchema = z.object({ id: z.string().regex(SOUND_ID), active: z.boolean() });

export async function toggleSoundAction(input: unknown): Promise<ActionResult> {
  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Données invalides." };
  const { id, active } = parsed.data;
  const result = await change((sons) => {
    if (!isBuiltin(id) && !sons[id]) return "Son introuvable.";
    sons[id] = { ...sons[id], active };
    return null;
  });
  return result.ok ? { ok: true, message: active ? "Branché : Tamilya peut s'en servir." : "Débranché : Tamilya ne s'en sert plus." } : result;
}

const settingsSchema = z.object({
  name: z.string().trim().min(3).max(120),
  height: z.enum(["haut", "milieu", "bas"]).nullable(),
  width: z.number().int().min(10).max(360).nullable(),
  scary: z.boolean(),
  light: z.boolean(),
});

const updateSchema = settingsSchema.extend({ id: z.string().regex(SOUND_ID) });

export async function updateSoundAction(input: unknown): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Vérifie la description (3 caractères au moins)." };
  const { id, ...settings } = parsed.data;
  return change((sons) => {
    if (!isBuiltin(id) && !sons[id]) return "Son introuvable.";
    sons[id] = { ...sons[id], ...settings };
    return null;
  });
}

const uploadSchema = z.object({ id: z.string().regex(SOUND_ID), ext: z.string().toLowerCase().regex(AUDIO_EXT) });

/** Adresse d'envoi du fichier : le navigateur l'envoie directement au stockage, puis on l'enregistre. */
export async function startSoundUploadAction(input: unknown): Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }> {
  const auth = await requireAdminAction();
  if (!auth) return { ok: false, message: NOT_ADMIN.message };
  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Fichier refusé : un son en webm, ogg, mp3, m4a ou wav." };
  try {
    return { ok: true, ...(await createSoundUpload(`fichiers/${parsed.data.id}-${Date.now()}.${parsed.data.ext}`)) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Envoi impossible." };
  }
}

const addSchema = settingsSchema.extend({
  id: z.string().regex(SOUND_ID),
  kind: z.enum(["decor", "bruit", "musique"]),
  file: z.string().regex(FILE_PATH),
});

export async function addSoundAction(input: unknown): Promise<ActionResult> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Vérifie le nom, la description et le fichier." };
  const { id, file, ...settings } = parsed.data;
  if (!(await checkSoundFile(file))) return { ok: false, message: "Le fichier n'est pas arrivé (3 Mo au plus) : réessaie." };
  const result = await change((sons) => {
    if (isBuiltin(id) || sons[id]) return "Ce nom est déjà pris : choisis-en un autre.";
    sons[id] = { ...settings, file, active: true };
    return null;
  });
  if (!result.ok) await removeSoundFile(file);
  return result.ok ? { ok: true, message: "Ajouté et branché : Tamilya peut s'en servir dès la prochaine histoire." } : result;
}

const replaceSchema = z.object({ id: z.string().regex(SOUND_ID), file: z.string().regex(FILE_PATH) });

export async function replaceSoundFileAction(input: unknown): Promise<ActionResult> {
  const parsed = replaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Données invalides." };
  const { id, file } = parsed.data;
  if (!(await checkSoundFile(file))) return { ok: false, message: "Le fichier n'est pas arrivé (3 Mo au plus) : réessaie." };
  let old: string | null = null;
  const result = await change((sons) => {
    if (!isBuiltin(id) && !sons[id]) return "Son introuvable.";
    old = sons[id]?.file ?? null;
    sons[id] = { ...sons[id], file };
    return null;
  });
  if (result.ok) await removeSoundFile(old);
  else await removeSoundFile(file);
  return result.ok ? { ok: true, message: "Fichier remplacé." } : result;
}

/** Son d'origine : tout redevient comme au départ (nom, réglages, fichier). Son ajouté : supprimé. */
export async function resetOrDeleteSoundAction(id: unknown): Promise<ActionResult> {
  const parsed = z.string().regex(SOUND_ID).safeParse(id);
  if (!parsed.success) return { ok: false, message: "Données invalides." };
  let file: string | null = null;
  const builtin = isBuiltin(parsed.data);
  const result = await change((sons) => {
    if (!sons[parsed.data]) return builtin ? "Ce son est déjà comme à l'origine." : "Son introuvable.";
    file = sons[parsed.data].file ?? null;
    delete sons[parsed.data];
    return null;
  });
  if (result.ok) await removeSoundFile(file);
  return result.ok ? { ok: true, message: builtin ? "Remis comme à l'origine." : "Supprimé." } : result;
}

import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Journal des chansons refusées par Lyria (Google), pour comprendre ce qui bloque et régler
 * Tamilya ensuite (demande de l'utilisateur, 2026-11-09 : les journaux Vercel gratuits ne gardent
 * que 30 minutes). Un fichier JSON par refus dans un dossier privé du stockage Supabase, créé tout
 * seul au premier refus : pas de migration à appliquer. Jamais de compte ni d'adresse dedans.
 */

const BUCKET = "chansons-refusees";

export type SongRefusal = { attempt: number; status: number; reason: string; style: string; lyrics: string };

export async function logSongRefusal(refusal: SongRefusal) {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  try {
    const { data } = await admin.storage.getBucket(BUCKET);
    if (!data) await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 20_000, allowedMimeTypes: ["application/json"] });
    const at = new Date().toISOString();
    const name = `${at.replace(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}.json`;
    const body = new Blob([JSON.stringify({ at, ...refusal }, null, 1)], { type: "application/json" });
    const { error } = await admin.storage.from(BUCKET).upload(name, body, { contentType: "application/json" });
    if (error) console.error("[chanson] Refus non noté", error.message);
  } catch (error) {
    console.error("[chanson] Refus non noté", error instanceof Error ? error.message : "inconnue");
  }
}

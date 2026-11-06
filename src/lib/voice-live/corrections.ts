import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { VoiceCorrection } from "./listening";

export type VoiceCorrectionRow = VoiceCorrection & { id: string };

/** Gardées en mémoire : relues à chaque échange parlé. Tout de suite à jour sur ce serveur, partout en moins de 30 s. */
const TTL_MS = 30_000;
let cached: { rows: VoiceCorrectionRow[]; at: number } | null = null;

/** null : liste illisible (migration absente ?). */
export async function listVoiceCorrections(): Promise<VoiceCorrectionRow[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("voice_corrections").select("id, heard, meant").order("created_at", { ascending: false });
  if (error) {
    console.error("[vocal] Corrections d'écoute illisibles", error.message);
    return null;
  }
  return data;
}

/** Sans correction lisible, le vocal marche comme avant. */
export async function loadVoiceCorrections(): Promise<VoiceCorrection[]> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rows;
  const rows = await listVoiceCorrections();
  if (!rows) return cached?.rows ?? [];
  cached = { rows, at: Date.now() };
  return rows;
}

export async function addVoiceCorrection(heard: string, meant: string, userId: string): Promise<"saved" | "duplicate" | "failed"> {
  const admin = getSupabaseAdminClient();
  if (!admin) return "failed";
  const { error } = await admin.from("voice_corrections").insert({ heard, meant, created_by: userId });
  if (error?.code === "23505") return "duplicate";
  if (error) {
    console.error("[vocal] Correction non enregistrée", error.message);
    return "failed";
  }
  cached = null;
  return "saved";
}

export async function removeVoiceCorrection(id: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("voice_corrections").delete().eq("id", id);
  if (error) console.error("[vocal] Correction non retirée", error.message);
  else cached = null;
  return !error;
}

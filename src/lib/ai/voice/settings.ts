import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_VOICE, isGeminiVoice, type GeminiVoiceId } from "./voices";

const CACHE_MS = 30_000;
let cache: { voice: GeminiVoiceId; expiresAt: number } | null = null;

/** Voix choisie dans /admin/voix (awa_settings.voice) ; Leda sans la migration. */
export async function loadVoice(): Promise<GeminiVoiceId> {
  if (cache && cache.expiresAt > Date.now()) return cache.voice;
  const admin = getSupabaseAdminClient();
  let voice: GeminiVoiceId = DEFAULT_VOICE;
  if (admin) {
    const { data, error } = await admin.from("awa_settings").select("voice").eq("id", 1).maybeSingle();
    if (error) console.error("[voix] Réglage illisible (migration 20261128000000_voix_tamilya.sql appliquée ?)", error);
    else if (isGeminiVoice(data?.voice)) voice = data.voice;
  }
  cache = { voice, expiresAt: Date.now() + CACHE_MS };
  return voice;
}

export async function saveVoice(voice: GeminiVoiceId): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("awa_settings").update({ voice }).eq("id", 1);
  if (error) {
    console.error("[voix] Enregistrement impossible", error);
    return false;
  }
  cache = { voice, expiresAt: Date.now() + CACHE_MS };
  return true;
}

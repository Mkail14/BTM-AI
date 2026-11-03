import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { NO_ANNOUNCEMENT, type Announcement } from "./announcement-rules";

/**
 * Bandeau de la page d'accueil (table site_settings), lu avec la clé secrète.
 * Gardé en mémoire 30 s, comme la maintenance : relu tout de suite après un changement sur ce serveur.
 */
const TTL_MS = 30_000;
let cached: { value: Announcement; at: number } | null = null;

/** null avec fresh : illisible (migration 20261121000000 absente ?), pour l'avertir dans l'administration. */
export async function getAnnouncement({ fresh = false }: { fresh?: boolean } = {}): Promise<Announcement | null> {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const admin = getSupabaseAdminClient();
  if (!admin) return NO_ANNOUNCEMENT;
  const { data, error } = await admin
    .from("site_settings")
    .select("announcement_enabled, announcement_text, announcement_link_label, announcement_link_url")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    console.error("[site] Bandeau illisible", error.message);
    return fresh ? null : (cached?.value ?? NO_ANNOUNCEMENT);
  }
  const value: Announcement = {
    enabled: Boolean(data?.announcement_enabled),
    text: data?.announcement_text ?? "",
    linkLabel: data?.announcement_link_label ?? "",
    linkUrl: data?.announcement_link_url ?? "",
  };
  cached = { value, at: Date.now() };
  return value;
}

export async function saveAnnouncement(announcement: Announcement, userId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("site_settings")
    .update({
      announcement_enabled: announcement.enabled,
      announcement_text: announcement.text,
      announcement_link_label: announcement.linkLabel,
      announcement_link_url: announcement.linkUrl,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", 1)
    .select("id");
  if (error || !data?.length) {
    console.error("[site] Bandeau non enregistré", error?.message);
    return false;
  }
  cached = null;
  return true;
}

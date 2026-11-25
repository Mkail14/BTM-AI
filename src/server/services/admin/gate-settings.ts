import "server-only";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { ADMIN_CODE_OFF_KEY, ADMIN_IDLE_KEY } from "./gate";

/**
 * Réglages du verrou admin d'un compte (Mon compte, Sécurité) : délai avant
 * qu'il se referme, et code retiré. Gardés dans app_metadata, que seul le
 * serveur peut écrire (pas user_metadata : la personne pourrait s'y retirer
 * le code sans le taper).
 */
export async function saveGateSettings(userId: string, patch: { idle?: number; codeOff?: boolean }): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) return false;
  const meta: Record<string, unknown> = { ...(data.user.app_metadata ?? {}) };
  if (patch.idle !== undefined) meta[ADMIN_IDLE_KEY] = patch.idle;
  if (patch.codeOff === true) meta[ADMIN_CODE_OFF_KEY] = true;
  // null et pas delete : Supabase fusionne app_metadata, une clé absente resterait en place.
  if (patch.codeOff === false) meta[ADMIN_CODE_OFF_KEY] = null;
  const { error: updateError } = await admin.auth.admin.updateUserById(userId, { app_metadata: meta });
  if (updateError) console.error("[admin] Réglage du verrou non enregistré", updateError.message);
  return !updateError;
}

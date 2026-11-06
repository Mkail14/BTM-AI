import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/ai/secret-box";
import { DriveAccessLost, refreshDriveAccess, revokeDriveToken } from "./oauth";

/** Lien compte Tamilya ↔ Google Drive. Le jeton est chiffré et ne quitte jamais le serveur. */

const TABLE = "drive_connections";

export async function isDriveConnected(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.from(TABLE).select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Lecture du lien Google Drive impossible");
  return data !== null;
}

export async function saveDriveConnection(admin: SupabaseClient, userId: string, refreshToken: string, email: string | null): Promise<void> {
  const { error } = await admin
    .from(TABLE)
    .upsert({ user_id: userId, refresh_token: encryptSecret(refreshToken), google_email: email, connected_at: new Date().toISOString() });
  if (error) throw new Error("Enregistrement du lien Google Drive impossible");
}

async function readRefreshToken(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.from(TABLE).select("refresh_token").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Lecture du lien Google Drive impossible");
  return data ? decryptSecret(data.refresh_token as string) : null;
}

async function forgetDriveConnection(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.from(TABLE).delete().eq("user_id", userId);
  if (error) throw new Error("Suppression du lien Google Drive impossible");
}

/** Accès du moment ; null si le compte n'est pas (ou plus) relié. */
export async function driveAccessFor(admin: SupabaseClient, userId: string): Promise<string | null> {
  const refreshToken = await readRefreshToken(admin, userId);
  if (!refreshToken) return null;
  try {
    return await refreshDriveAccess(refreshToken);
  } catch (error) {
    if (!(error instanceof DriveAccessLost)) throw error;
    await forgetDriveConnection(admin, userId);
    return null;
  }
}

/** Déconnexion ou suppression du compte : l'accès est retiré chez Google, les fichiers restent dans le Drive. */
export async function disconnectDrive(admin: SupabaseClient, userId: string): Promise<void> {
  const refreshToken = await readRefreshToken(admin, userId);
  // Google injoignable : on oublie quand même le jeton ; la personne garde la main depuis son compte Google.
  if (refreshToken) await revokeDriveToken(refreshToken).catch(() => {});
  await forgetDriveConnection(admin, userId);
}

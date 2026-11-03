import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { forgetSiteFlags, getSiteFlags, type SiteFlags } from "./flags";

/**
 * Réglages du site (table site_settings, une ligne), lus avec la clé secrète :
 * aucune politique RLS, ni le navigateur ni les utilisateurs n'y ont accès.
 */

export type { SiteFlags };
export { getSiteFlags };
export type BankDetails = { holder: string; bankName: string; iban: string; bic: string };
export type SettingsChange = { at: string; by: string | null };

/** Dernière modification des réglages (date et compte), pour le Profil de l'entreprise. */
export async function getLastChange(): Promise<SettingsChange | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("site_settings").select("updated_at, updated_by").eq("id", 1).maybeSingle();
  if (error || !data) return null;
  return { at: data.updated_at, by: data.updated_by };
}

/** Une ligne du journal de l'état de la plateforme (mise en maintenance ou réouverture). */
export type StatusChange = { at: string; byEmail: string | null; maintenance: boolean; message: string };

/** Derniers changements d'état, du plus récent au plus ancien. null : journal illisible (migration absente ?). */
export async function getStatusLog(limit = 8): Promise<StatusChange[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("site_status_log")
    .select("changed_at, changed_by_email, maintenance, message")
    .order("changed_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[site] Journal de l'état illisible", error.message);
    return null;
  }
  return data.map((row) => ({ at: row.changed_at, byEmail: row.changed_by_email, maintenance: row.maintenance, message: row.message }));
}

/**
 * Met le site en maintenance ou le rouvre, et l'inscrit au journal (auteur,
 * date, message) dans la même transaction : fonction set_site_status, que
 * seul le serveur peut appeler. message undefined : le message actuel est gardé.
 */
export async function saveSiteStatus(
  maintenance: boolean,
  message: string | undefined,
  by: { id: string; email: string | null },
): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.rpc("set_site_status", {
    p_maintenance: maintenance,
    p_message: message ?? null,
    p_by: by.id,
    p_by_email: by.email,
  });
  if (error) {
    // Fonction absente (migration du journal pas encore appliquée) : l'état est quand même
    // changé, sans journal ; la page des réglages signale que l'historique est indisponible.
    if (error.code === "PGRST202") {
      console.error("[site] set_site_status absente : état changé sans journal (migration 20261120010000 à appliquer)");
      const row: Record<string, unknown> = { maintenance, updated_at: new Date().toISOString(), updated_by: by.id };
      if (message !== undefined) row.maintenance_message = message;
      const { data, error: updateError } = await admin.from("site_settings").update(row).eq("id", 1).select("id");
      if (updateError || !data?.length) return false;
      forgetSiteFlags();
      return true;
    }
    console.error("[site] État de la plateforme non enregistré", error.message);
    return false;
  }
  forgetSiteFlags();
  return true;
}

/** Message aux visiteurs et mode démo. L'état (maintenance) passe par saveSiteStatus, pour le journal. */
export async function saveSiteFlags(changes: Partial<Omit<SiteFlags, "maintenance">>, userId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: userId };
  if (changes.maintenanceMessage !== undefined) row.maintenance_message = changes.maintenanceMessage;
  if (changes.demoMode !== undefined) row.demo_mode = changes.demoMode;
  const { data, error } = await admin.from("site_settings").update(row).eq("id", 1).select("id");
  if (error || !data?.length) {
    console.error("[site] Réglages non enregistrés", error?.message);
    return false;
  }
  forgetSiteFlags();
  return true;
}

export async function getBankDetails(): Promise<BankDetails | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("site_settings")
    .select("bank_holder, bank_name, bank_iban, bank_bic")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return { holder: data.bank_holder, bankName: data.bank_name, iban: data.bank_iban, bic: data.bank_bic };
}

export async function saveBankDetails(bank: BankDetails, userId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("site_settings")
    .update({
      bank_holder: bank.holder,
      bank_name: bank.bankName,
      bank_iban: bank.iban,
      bank_bic: bank.bic,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", 1)
    .select("id");
  if (error || !data?.length) {
    console.error("[site] RIB non enregistré", error?.message);
    return false;
  }
  return true;
}

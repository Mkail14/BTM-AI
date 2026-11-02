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

export async function saveSiteFlags(changes: Partial<SiteFlags>, userId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const row: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: userId };
  if (changes.maintenance !== undefined) row.maintenance = changes.maintenance;
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

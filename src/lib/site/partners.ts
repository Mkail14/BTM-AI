import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { forgetSiteFlags } from "./flags";

/**
 * Partenaires à Mayotte, ajoutés par l'administrateur principal (table partners).
 * Le premier validé ouvre le site s'il était en attente (fonction validate_partner).
 */

export type Partner = { id: string; name: string; activity: string; validatedAt: string | null };

/** Du plus ancien au plus récent. null : liste illisible (migration absente ?). */
export async function listPartners(): Promise<Partner[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.from("partners").select("id, name, activity, validated_at").order("created_at");
  if (error) {
    console.error("[site] Partenaires illisibles", error.message);
    return null;
  }
  return data.map((row) => ({ id: row.id, name: row.name, activity: row.activity, validatedAt: row.validated_at }));
}

export async function addPartner(name: string, activity: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("partners").insert({ name, activity });
  if (error) console.error("[site] Partenaire non ajouté", error.message);
  return !error;
}

export async function removePartner(id: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("partners").delete().eq("id", id);
  if (error) console.error("[site] Partenaire non retiré", error.message);
  return !error;
}

export type PartnerValidation = "opened" | "validated" | "unchanged" | "failed";

export async function validatePartner(id: string, by: { id: string; email: string | null }): Promise<PartnerValidation> {
  const admin = getSupabaseAdminClient();
  if (!admin) return "failed";
  const { data, error } = await admin.rpc("validate_partner", { p_partner: id, p_by: by.id, p_by_email: by.email });
  if (error) {
    console.error("[site] Partenaire non validé", error.message);
    return "failed";
  }
  forgetSiteFlags();
  return data as PartnerValidation;
}

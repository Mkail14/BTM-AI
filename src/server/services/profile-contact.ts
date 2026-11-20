import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Address } from "@/lib/address";

/** Adresse et téléphone du compte (RLS : seulement les siens). */
export type ProfileContact = { address: Address | null; phone: string | null };

/**
 * Lit l'adresse et le téléphone enregistrés. « * » : la page reste utilisable
 * tant que la migration 20261112000000_address_contact_security.sql n'est pas
 * appliquée (rien n'est alors pré-rempli).
 */
export async function getProfileContact(supabase: SupabaseClient, userId: string): Promise<ProfileContact> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (!data) return { address: null, phone: null };
  const address: Address | null =
    typeof data.address_commune === "string" && typeof data.address_line === "string"
      ? {
          commune: data.address_commune,
          line: data.address_line,
          geo:
            typeof data.address_lat === "number" && typeof data.address_lng === "number"
              ? { lat: data.address_lat, lng: data.address_lng, accuracy: Number(data.address_accuracy ?? 0) }
              : null,
        }
      : null;
  return { address, phone: typeof data.phone === "string" ? data.phone : null };
}

/** Enregistre l'adresse confirmée ou corrigée (déjà vérifiée par addressSchema). */
export async function saveProfileAddress(supabase: SupabaseClient, userId: string, address: Address) {
  const { error } = await supabase
    .from("profiles")
    .update({
      address_commune: address.commune,
      address_line: address.line,
      address_lat: address.geo?.lat ?? null,
      address_lng: address.geo?.lng ?? null,
      address_accuracy: address.geo?.accuracy ?? null,
      address_updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) throw error;
}

/** Enregistre le téléphone (déjà mis au propre par normalizePhone). */
export async function saveProfilePhone(supabase: SupabaseClient, userId: string, phone: string) {
  const { error } = await supabase.from("profiles").update({ phone }).eq("id", userId);
  if (error) throw error;
}

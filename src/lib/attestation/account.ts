import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type AttestationPrefill, splitAddressLine, splitDisplayName } from "./prefill";

/**
 * Ce que le compte connaît déjà de la personne : sa dernière demande du code de la route
 * (nom, naissance) et son profil (adresse, téléphone). Toujours ce compte-là, même pour un
 * administrateur qui lit toutes les demandes avec la RLS.
 */
export async function readAccountInfo(supabase: SupabaseClient, userId: string): Promise<AttestationPrefill & { phone?: string }> {
  const [{ data: exam }, { data: profile }] = await Promise.all([
    supabase
      .from("code_exam_requests")
      .select("civility, last_name, first_name, birth_date, city")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // « * » : la page reste utilisable avant les migrations de l'adresse.
    supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
  ]);
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const name = splitDisplayName(text(profile?.display_name) ?? "");
  const street = splitAddressLine(text(profile?.address_line) ?? "");
  return {
    civility: text(exam?.civility),
    lastName: text(exam?.last_name) ?? name.lastName,
    firstName: text(exam?.first_name) ?? name.firstName,
    birthDate: text(exam?.birth_date),
    address: street.address,
    postalCode: street.postalCode,
    city: text(profile?.address_commune) ?? text(exam?.city),
    phone: text(profile?.phone),
  };
}

import { NextResponse } from "next/server";
import { type AttestationPrefill, splitAddressLine, splitDisplayName } from "@/lib/attestation/prefill";
import { getAuthContext } from "@/lib/auth/session";

/** Attestation d'hébergement : ce que le compte connaît déjà de la personne. 401 sans compte. */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const [{ data: exam }, { data: profile }] = await Promise.all([
    supabase
      .from("code_exam_requests")
      .select("civility, last_name, first_name, birth_date, city")
      // Toujours la demande de CE compte (un administrateur lit toutes les demandes avec la RLS).
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // « * » : la page reste utilisable avant les migrations de l'adresse.
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
  ]);
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
  const name = splitDisplayName(text(profile?.display_name) ?? "");
  const street = splitAddressLine(text(profile?.address_line) ?? "");
  const prefill: AttestationPrefill = {
    civility: text(exam?.civility),
    lastName: text(exam?.last_name) ?? name.lastName,
    firstName: text(exam?.first_name) ?? name.firstName,
    birthDate: text(exam?.birth_date),
    address: street.address,
    postalCode: street.postalCode,
    city: text(profile?.address_commune) ?? text(exam?.city),
  };
  return NextResponse.json({ prefill }, { headers: { "Cache-Control": "no-store" } });
}

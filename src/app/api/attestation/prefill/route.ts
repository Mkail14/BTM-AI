import { NextResponse } from "next/server";
import { readAccountInfo } from "@/lib/attestation/account";
import type { AttestationPrefill } from "@/lib/attestation/prefill";
import { getAuthContext } from "@/lib/auth/session";

/** Attestation d'hébergement : ce que le compte connaît déjà de la personne. 401 sans compte. */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const info = await readAccountInfo(supabase, user.id);
  // Le téléphone ne sert pas à l'attestation : il n'est pas renvoyé.
  const prefill: AttestationPrefill = {
    civility: info.civility,
    lastName: info.lastName,
    firstName: info.firstName,
    birthDate: info.birthDate,
    address: info.address,
    postalCode: info.postalCode,
    city: info.city,
  };
  return NextResponse.json({ prefill }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";

/** Solde affiché en bas de la barre latérale. */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const { data, error } = await supabase.from("wallets").select("balance_cents").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Portefeuille indisponible." }, { status: 503 });
  return NextResponse.json({ balanceCents: data?.balance_cents ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}

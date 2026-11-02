import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { forgetDemoWallet, readDemoWallet, usesDemoWallet } from "@/lib/wallet/demo";

/** Solde affiché en bas de la barre latérale (fictif pour ceux qui essaient la démonstration de commande de repas). */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (await usesDemoWallet(user)) {
    const demo = await readDemoWallet(user.id);
    return NextResponse.json({ balanceCents: demo.balanceCents, demo: true }, { headers: { "Cache-Control": "no-store" } });
  }
  // Démo éteinte : le solde fictif de ce navigateur est oublié, la prochaine démo repart de 150 €.
  await forgetDemoWallet();
  const { data, error } = await supabase.from("wallets").select("balance_cents").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Portefeuille indisponible." }, { status: 503 });
  return NextResponse.json({ balanceCents: data?.balance_cents ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}

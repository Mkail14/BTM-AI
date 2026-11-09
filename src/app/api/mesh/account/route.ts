import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { getProfile } from "@/lib/conversations/repository";
import { canUseWallet } from "@/lib/wallet/access";
import { readDemoWallet, usesDemoWallet } from "@/lib/wallet/demo";

/**
 * Bas du menu de Tamilya Connect (app Android) : le nom et le solde, comme dans la barre
 * latérale du site. L'app le lit avec internet et le garde pour l'afficher sans internet.
 */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  let name: string | null = null;
  try {
    ({ displayName: name } = await getProfile(supabase, user.id));
  } catch {
    // Profil indisponible : l'adresse e-mail sert de nom.
  }
  let balanceCents: number | null = null;
  let demo = false;
  if (!canUseWallet(user)) {
    // Portefeuille réservé aux admins pour l'instant : pas de solde affiché.
  } else if (await usesDemoWallet(user)) {
    balanceCents = (await readDemoWallet(user.id)).balanceCents;
    demo = true;
  } else {
    const { data, error } = await supabase.from("wallets").select("balance_cents").eq("user_id", user.id).maybeSingle();
    // Portefeuille indisponible : l'app garde le dernier solde connu.
    if (error) return NextResponse.json({ error: "Portefeuille indisponible." }, { status: 503 });
    balanceCents = data?.balance_cents ?? 0;
  }
  return NextResponse.json({ name, email: user.email ?? null, balanceCents, demo }, { headers: { "Cache-Control": "no-store" } });
}

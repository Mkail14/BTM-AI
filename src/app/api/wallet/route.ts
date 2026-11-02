import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { canOrderFood } from "@/lib/food/access";
import { FOOD_DEMO, FOOD_DEMO_BALANCE_CENTS } from "@/lib/food/catalog";

/** Solde affiché en bas de la barre latérale (fictif pour ceux qui essaient la démonstration de commande de repas). */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  if (FOOD_DEMO && canOrderFood(user)) {
    return NextResponse.json({ balanceCents: FOOD_DEMO_BALANCE_CENTS, demo: true }, { headers: { "Cache-Control": "no-store" } });
  }
  const { data, error } = await supabase.from("wallets").select("balance_cents").eq("user_id", user.id).maybeSingle();
  if (error) return NextResponse.json({ error: "Portefeuille indisponible." }, { status: 503 });
  return NextResponse.json({ balanceCents: data?.balance_cents ?? 0 }, { headers: { "Cache-Control": "no-store" } });
}

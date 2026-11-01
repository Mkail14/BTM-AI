import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { canOrderFood } from "@/lib/food/access";
import { FOOD_CATALOG, FOOD_DELIVERY_FEE_CENTS, FOOD_DEMO, FOOD_ZONES, priceOrder, type FoodRestaurant } from "@/lib/food/catalog";
import { normalizePhone } from "@/lib/code-exam/candidate";
import { isSameOrigin } from "@/lib/security/request";
import { loadWallet, spendFromWallet } from "@/lib/wallet";
import { formatEuros } from "@/lib/wallet/limits";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** Ce que renvoie GET : lu par la commande de repas dans la conversation. */
export type FoodResponse = {
  demo: boolean;
  restaurants: FoodRestaurant[];
  zones: readonly string[];
  deliveryCents: number;
  balanceCents: number;
};

/** Restaurants, menus et solde du portefeuille. 403 si la commande de repas n'est pas ouverte à ce compte. */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour commander.");
  if (!canOrderFood(user)) return fail(403, "La commande de repas n'est pas encore disponible.");
  const wallet = await loadWallet(supabase, user.id, 1);
  const body: FoodResponse = {
    demo: FOOD_DEMO,
    restaurants: [...FOOD_CATALOG],
    zones: FOOD_ZONES,
    deliveryCents: FOOD_DELIVERY_FEE_CENTS,
    balanceCents: wallet.balanceCents,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

const orderSchema = z.object({
  restaurantId: z.string().max(60),
  cart: z.array(z.object({ itemId: z.string().max(60), quantity: z.number().int() })).min(1).max(30),
  address: z.string().trim().min(5, "Indique ton adresse (rue, quartier, repère).").max(200),
  zone: z.enum(FOOD_ZONES, { error: "Choisis ta commune." }),
  phone: z.string().refine((v) => normalizePhone(v) !== null, "Numéro invalide : 10 chiffres, par exemple 0639 12 34 56."),
  note: z.string().trim().max(200).optional(),
});

/**
 * Paie une commande avec le portefeuille. Prix recalculés ici (jamais ceux du
 * navigateur). Prototype : aucun restaurant ne reçoit la commande, donc le
 * solde est vérifié mais rien n'est débité.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour commander.");
  if (!canOrderFood(user)) return fail(403, "La commande de repas n'est pas encore disponible.");

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Commande invalide.");
  const order = priceOrder(parsed.data.restaurantId, parsed.data.cart);
  if (!order) return fail(400, "Un plat de ta commande n'existe plus : recommence ton panier.");

  const wallet = await loadWallet(supabase, user.id, 1);
  if (wallet.balanceCents < order.totalCents) {
    return fail(402, `Solde insuffisant : il te manque ${formatEuros(order.totalCents - wallet.balanceCents)}.`);
  }

  const label = `Repas ${order.restaurant.name}`.slice(0, 120);
  if (!FOOD_DEMO) {
    // Avec un vrai partenaire : débit, puis envoi de la commande au restaurant (remboursement s'il refuse).
    const paid = await spendFromWallet(user.id, order.totalCents, label);
    if (!paid) return fail(402, "Solde insuffisant.");
  }

  const [min, max] = order.restaurant.etaMinutes;
  return NextResponse.json({
    ok: true,
    demo: FOOD_DEMO,
    totalCents: order.totalCents,
    // Heure d'arrivée estimée : milieu de la fourchette annoncée.
    arrivesAt: new Date(Date.now() + ((min + max) / 2) * 60_000).toISOString(),
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { canOrderFood } from "@/lib/food/access";
import { canCancel, tooLateMessage } from "@/lib/food/cancel";
import { readLastOrder, rememberOrder } from "@/lib/food/last-order";
import { isSameOrigin } from "@/lib/security/request";
import { recordDemoOperation, usesDemoWallet } from "@/lib/wallet/demo";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

const bodySchema = z.object({ code: z.string().max(20) });

/** Ce que renvoie POST quand l'annulation a réussi. */
export type FoodCancelled = { ok: true; refundedCents: number; balanceCents: number };

/**
 * Annule une commande jusqu'à 4 h avant le début de sa préparation et la
 * rembourse tout de suite sur le moyen de paiement utilisé (le portefeuille).
 * La commande et ses heures viennent du cookie signé du serveur, jamais du
 * navigateur. Démonstration : le solde fictif est recrédité.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { user } = await getAuthContext();
  if (!user) return fail(401, "Connecte-toi pour annuler.");
  if (!(await canOrderFood(user))) return fail(403, "La commande de repas n'est pas encore disponible.");
  // Hors démonstration, aucune commande n'est encore payée (voir /api/food).
  if (!(await usesDemoWallet(user))) return fail(503, "La commande de repas n'est pas encore ouverte.");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Commande inconnue.");

  const order = await readLastOrder(user.id);
  // Seule la dernière commande est connue du serveur : une plus ancienne se règle avec le restaurant.
  if (!order || order.code !== parsed.data.code) {
    return fail(404, "Cette commande ne peut pas être annulée ici : contacte directement le restaurant.");
  }
  if (order.cancelled) return fail(409, "Cette commande est déjà annulée et remboursée.");
  if (!canCancel(order)) return fail(409, tooLateMessage(order.restaurant));

  const wallet = await recordDemoOperation(user.id, "refund", order.totalCents, `Remboursement ${order.restaurant}`.slice(0, 120));
  if (!wallet) return fail(503, "Remboursement impossible pour le moment : réessaie dans un instant.");
  // Marquée annulée : un second clic ne rembourse pas deux fois.
  await rememberOrder({ ...order, cancelled: true });

  const body: FoodCancelled = { ok: true, refundedCents: order.totalCents, balanceCents: wallet.balanceCents };
  return NextResponse.json(body);
}

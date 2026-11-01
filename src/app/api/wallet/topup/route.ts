import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { formatEuros, topupError } from "@/lib/wallet/limits";
import { createTopupCheckout, stripeConfigured } from "@/lib/wallet/stripe";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

const bodySchema = z.object({ amountCents: z.number().int() });

/** Lance une recharge : renvoie l'adresse de la page de paiement sécurisée de Stripe. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour recharger ton portefeuille.");
  const admin = getSupabaseAdminClient();
  if (!stripeConfigured() || !admin) return fail(503, "Le paiement n'est pas encore ouvert.");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Montant invalide.");
  const { amountCents } = parsed.data;

  const limit = await consumeRateLimits([{ key: `wallet:${user.id}`, rules: RATE_LIMIT_POLICIES.walletTopup }]);
  if (!limit.allowed) return fail(429, "Trop de tentatives : réessaie dans une heure.");

  // Le plafond compte aussi les recharges en cours de paiement (moins de 30 minutes).
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const [wallet, pending] = await Promise.all([
    supabase.from("wallets").select("balance_cents").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("wallet_transactions")
      .select("amount_cents")
      .eq("user_id", user.id)
      .eq("kind", "topup")
      .eq("status", "pending")
      .gte("created_at", since),
  ]);
  if (wallet.error || pending.error) return fail(503, "Portefeuille indisponible pour le moment.");
  const engaged = (wallet.data?.balance_cents ?? 0) + (pending.data ?? []).reduce((sum, t) => sum + t.amount_cents, 0);
  const problem = topupError(amountCents, engaged);
  if (problem) return fail(400, problem);

  try {
    const session = await createTopupCheckout({
      userId: user.id,
      email: user.email,
      amountCents,
      origin: request.nextUrl.origin,
    });
    const { error } = await admin.from("wallet_transactions").insert({
      user_id: user.id,
      kind: "topup",
      amount_cents: amountCents,
      status: "pending",
      label: `Recharge de ${formatEuros(amountCents)}`,
      stripe_session_id: session.id,
    });
    if (error || !session.url) throw error ?? new Error("Stripe n'a pas donné de page de paiement");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[portefeuille] Recharge impossible", error);
    return fail(502, "Le paiement n'a pas pu démarrer. Réessaie dans un instant.");
  }
}

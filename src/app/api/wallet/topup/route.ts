import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { canUseWallet } from "@/lib/wallet/access";
import { readDemoWallet, recordDemoOperation, usesDemoWallet } from "@/lib/wallet/demo";
import { formatEuros, topupError, WALLET_MAX_BALANCE } from "@/lib/wallet/limits";
import { createTopupCheckout, stripeConfigured } from "@/lib/wallet/stripe";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

const bodySchema = z.object({ amountCents: z.number().int() });

/** Lance une recharge : renvoie l'adresse de la page de paiement sécurisée de Stripe. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour recharger ton portefeuille.");
  if (!(await canUseWallet(user))) return fail(403, "Le portefeuille arrive bientôt.");

  // Mode démo : recharge fictive, sans carte ni Stripe.
  if (await usesDemoWallet(user)) {
    const parsedDemo = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsedDemo.success) return fail(400, "Montant invalide.");
    const { amountCents } = parsedDemo.data;
    const problem = topupError(amountCents, (await readDemoWallet(user.id)).balanceCents);
    if (problem) return fail(400, problem);
    const demo = await recordDemoOperation(user.id, "topup", amountCents, `Recharge de ${formatEuros(amountCents)}`);
    return NextResponse.json({ demo: true, balanceCents: demo?.balanceCents ?? 0 });
  }

  const admin = getSupabaseAdminClient();
  if (!stripeConfigured() || !admin) return fail(503, "Le paiement n'est pas encore ouvert.");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Montant invalide.");
  const { amountCents } = parsed.data;

  try {
    const limit = await consumeRateLimits([{ key: `wallet:${user.id}`, rules: RATE_LIMIT_POLICIES.walletTopup }]);
    if (!limit.allowed) return fail(429, "Trop de tentatives : réessaie dans une heure.");
  } catch (error) {
    console.error("[portefeuille] Limite de débit indisponible", error);
    return fail(503, "Portefeuille indisponible pour le moment.");
  }

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

  // Plafond revérifié sous verrou dans la base (wallet_reserve_topup) : deux recharges lancées en
  // même temps ne peuvent pas le dépasser. Fonction absente (migration 20261126000000 pas encore
  // appliquée) : la vérification ci-dessus, sans verrou, reste seule.
  const label = `Recharge de ${formatEuros(amountCents)}`;
  let reservedId: string | null = null;
  const reserved = await admin.rpc("wallet_reserve_topup", {
    p_user_id: user.id,
    p_amount_cents: amountCents,
    p_label: label,
    p_max_balance_cents: WALLET_MAX_BALANCE,
  });
  if (!reserved.error) {
    if (!reserved.data) return fail(400, `Ton solde ne peut pas dépasser ${formatEuros(WALLET_MAX_BALANCE)}, recharges en cours comprises.`);
    reservedId = reserved.data as string;
  } else if (reserved.error.code !== "PGRST202") {
    console.error("[portefeuille] Réservation de la recharge impossible", reserved.error.message);
    return fail(503, "Portefeuille indisponible pour le moment.");
  }

  try {
    const session = await createTopupCheckout({
      userId: user.id,
      email: user.email,
      amountCents,
      origin: request.nextUrl.origin,
    });
    const { error } = reservedId
      ? await admin.from("wallet_transactions").update({ stripe_session_id: session.id }).eq("id", reservedId)
      : await admin.from("wallet_transactions").insert({
          user_id: user.id,
          kind: "topup",
          amount_cents: amountCents,
          status: "pending",
          label,
          stripe_session_id: session.id,
        });
    if (error || !session.url) throw error ?? new Error("Stripe n'a pas donné de page de paiement");
    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[portefeuille] Recharge impossible", error);
    // La place réservée dans le plafond est rendue tout de suite.
    if (reservedId) {
      await admin.from("wallet_transactions").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", reservedId).eq("status", "pending");
    }
    return fail(502, "Le paiement n'a pas pu démarrer. Réessaie dans un instant.");
  }
}

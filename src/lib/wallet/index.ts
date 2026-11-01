import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import type { WalletTransaction } from "./limits";
import { describeMethod, getCheckout } from "./stripe";

export type Wallet = { balanceCents: number; transactions: WalletTransaction[]; error: boolean };

/** Solde et historique de l'utilisateur connecté (lus avec RLS). */
export async function loadWallet(supabase: SupabaseClient, userId: string, limit = 50): Promise<Wallet> {
  const [wallet, history] = await Promise.all([
    supabase.from("wallets").select("balance_cents").eq("user_id", userId).maybeSingle(),
    supabase
      .from("wallet_transactions")
      .select("id, kind, amount_cents, status, label, method, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  if (wallet.error || history.error) console.error("[portefeuille] Lecture impossible", wallet.error ?? history.error);
  return {
    balanceCents: wallet.data?.balance_cents ?? 0,
    error: Boolean(wallet.error || history.error),
    transactions: (history.data ?? []).map((t) => ({
      id: t.id,
      kind: t.kind,
      amountCents: t.amount_cents,
      status: t.status,
      label: t.label,
      method: t.method,
      createdAt: t.created_at,
    })),
  };
}

/**
 * Crédite le solde si Stripe confirme le paiement de cette session (une seule fois,
 * même appelé par le retour sur le site et par le webhook). Renvoie l'état final.
 */
export async function settleTopup(sessionId: string): Promise<"paid" | "pending" | "failed"> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY manquante");
  // Toujours relu chez Stripe : on ne croit jamais un identifiant venu du navigateur.
  const session = await getCheckout(sessionId);
  if (session.metadata?.kind !== "wallet_topup") return "failed";

  if (session.payment_status === "paid") {
    const { error } = await admin.rpc("wallet_complete_topup", {
      p_session_id: session.id,
      p_method: describeMethod(session),
    });
    if (error) throw error;
    return "paid";
  }
  if (session.status === "expired") {
    await admin.rpc("wallet_fail_topup", { p_session_id: session.id });
    return "failed";
  }
  return "pending";
}

/**
 * Paie un service partenaire avec le solde (réservation…). Renvoie l'id de
 * l'opération, ou null si le solde ne suffit pas : rien n'est alors débité.
 */
export async function spendFromWallet(userId: string, amountCents: number, label: string): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY manquante");
  const { data, error } = await admin.rpc("wallet_spend", {
    p_user_id: userId,
    p_amount_cents: amountCents,
    p_label: label,
  });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Rembourse sur le solde un service partenaire annulé. */
export async function refundToWallet(userId: string, amountCents: number, label: string): Promise<string> {
  const admin = getSupabaseAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY manquante");
  const { data, error } = await admin.rpc("wallet_refund", {
    p_user_id: userId,
    p_amount_cents: amountCents,
    p_label: label,
  });
  if (error) throw error;
  return data as string;
}

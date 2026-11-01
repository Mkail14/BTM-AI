import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paiement par Stripe Checkout, appelé directement (sans SDK) : la carte est
 * saisie sur la page sécurisée de Stripe, jamais chez nous. Les moyens proposés
 * (carte, Apple Pay, Google Pay, PayPal…) se règlent dans le tableau de bord Stripe.
 */
const API = "https://api.stripe.com/v1";
const TIMEOUT_MS = 10_000;

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);

export type CheckoutSession = {
  id: string;
  url: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  status: "open" | "complete" | "expired";
  metadata: Record<string, string> | null;
  payment_intent: {
    payment_method: {
      type: string;
      card?: { brand?: string; last4?: string; wallet?: { type?: string } | null };
    } | null;
  } | null;
};

async function stripe<T>(path: string, init: { method?: "GET" | "POST"; form?: Record<string, string> } = {}): Promise<T> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe n'est pas configuré");
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: init.form ? new URLSearchParams(init.form) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Stripe ${res.status} : ${data?.error?.message ?? "réponse illisible"}`);
  return data as T;
}

export function createTopupCheckout(input: {
  userId: string;
  email: string | null;
  amountCents: number;
  origin: string;
}): Promise<CheckoutSession> {
  const form: Record<string, string> = {
    mode: "payment",
    locale: "fr",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount]": String(input.amountCents),
    "line_items[0][price_data][product_data][name]": "Recharge du portefeuille BTM AI",
    client_reference_id: input.userId,
    "metadata[user_id]": input.userId,
    "metadata[kind]": "wallet_topup",
    success_url: `${input.origin}/portefeuille?recharge={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.origin}/portefeuille?annule=1`,
    // La page de paiement expire au bout de 30 minutes (minimum accepté par Stripe).
    expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
  };
  if (input.email) form.customer_email = input.email;
  return stripe<CheckoutSession>("/checkout/sessions", { method: "POST", form });
}

export function getCheckout(sessionId: string): Promise<CheckoutSession> {
  return stripe<CheckoutSession>(
    `/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=payment_intent.payment_method`,
  );
}

const WALLETS: Record<string, string> = { apple_pay: "Apple Pay", google_pay: "Google Pay", link: "Link" };
const TYPES: Record<string, string> = { paypal: "PayPal", sepa_debit: "Prélèvement SEPA", link: "Link" };

/** Moyen de paiement lisible : « Visa •••• 4242 », « Apple Pay », « PayPal »… */
export function describeMethod(session: CheckoutSession): string {
  const method = session.payment_intent?.payment_method;
  if (!method) return "Carte bancaire";
  const card = method.card;
  if (method.type === "card" && card) {
    const wallet = card.wallet?.type ? WALLETS[card.wallet.type] : undefined;
    if (wallet) return wallet;
    const brand = card.brand ? card.brand.charAt(0).toUpperCase() + card.brand.slice(1) : "Carte";
    return card.last4 ? `${brand} •••• ${card.last4}` : brand;
  }
  return TYPES[method.type] ?? method.type;
}

/**
 * Vérifie l'en-tête Stripe-Signature d'un webhook (HMAC SHA-256 du « horodatage.corps »)
 * et refuse les messages de plus de 5 minutes.
 */
export function verifyWebhook(payload: string, header: string | null, secret: string, now = Date.now()): boolean {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.split("="));
  const timestamp = parts.find(([k]) => k === "t")?.[1];
  const signatures = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex"));
  return signatures.some((s) => {
    const given = Buffer.from(s ?? "");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

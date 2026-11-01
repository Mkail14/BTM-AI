import { NextResponse, type NextRequest } from "next/server";
import { settleTopup } from "@/lib/wallet";
import { verifyWebhook } from "@/lib/wallet/stripe";

const EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
]);

/**
 * Stripe prévient ici quand une recharge est payée (ou abandonnée), même si
 * l'utilisateur ferme la page avant de revenir sur le site. À déclarer dans
 * Stripe → Développeurs → Webhooks : https://<site>/api/wallet/webhook.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook non configuré." }, { status: 503 });

  const payload = await request.text();
  if (!verifyWebhook(payload, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Signature invalide." }, { status: 400 });
  }

  const event = JSON.parse(payload) as { type: string; data: { object: { id: string; metadata?: Record<string, string> } } };
  if (!EVENTS.has(event.type) || event.data.object.metadata?.kind !== "wallet_topup") {
    return NextResponse.json({ received: true });
  }
  try {
    await settleTopup(event.data.object.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    // 500 : Stripe renverra le message plus tard.
    console.error("[portefeuille] Webhook non traité", error);
    return NextResponse.json({ error: "Erreur temporaire." }, { status: 500 });
  }
}

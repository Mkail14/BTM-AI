import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { canBuyBargeTickets } from "@/lib/barge/access";
import { BARGE_MAX_QUANTITY, BARGE_ROUTE, BARGE_TICKETS, bargeDays, describeBargeLines, priceBargeOrder, type BargeTicketType } from "@/lib/barge/catalog";
import { orderCode } from "@/lib/food/order-code";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { PIN_REQUIRED, takePaymentGrant } from "@/lib/wallet/pay-auth";
import { readDemoWallet, recordDemoOperation, usesDemoWallet } from "@/lib/wallet/demo";
import { formatEuros } from "@/lib/wallet/limits";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });
const NOT_OPEN = "L'achat de tickets de barge n'est pas encore ouvert : aucun ticket réel n'est encore émis.";

/** Ce que renvoie GET : lu par l'achat de tickets dans la conversation. */
export type BargeResponse = {
  demo: boolean;
  route: typeof BARGE_ROUTE;
  tickets: readonly BargeTicketType[];
  /** Jours achetables (« AAAA-MM-JJ »), le premier est aujourd'hui à Mayotte. */
  days: string[];
  balanceCents: number;
};

/** Tarifs, jours et solde. 403 si l'achat de tickets n'est pas ouvert à ce compte. */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour acheter un ticket.");
  if (!(await canBuyBargeTickets(user))) return fail(403, "L'achat de tickets de barge n'est pas encore disponible.");
  // Aucun ticket réel n'est émis : seulement en démonstration (solde fictif, src/lib/wallet/demo.ts).
  if (!(await usesDemoWallet(user))) return fail(503, NOT_OPEN);
  const wallet = await readDemoWallet(user.id);
  const body: BargeResponse = { demo: true, route: BARGE_ROUTE, tickets: BARGE_TICKETS, days: bargeDays(), balanceCents: wallet.balanceCents };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

const purchaseSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  cart: z
    .array(z.object({ ticketId: z.string().max(30), quantity: z.number().int().min(0).max(BARGE_MAX_QUANTITY) }))
    .min(1)
    .max(BARGE_TICKETS.length),
});

/** Ce que renvoie POST : le billet à montrer à l'embarquement. */
export type BargeTicketBought = {
  ok: true;
  demo: boolean;
  code: string;
  day: string;
  lines: { label: string; detail: string; emoji: string; quantity: number }[];
  totalCents: number;
  boughtAt: string;
};

/**
 * Paie les tickets avec le portefeuille. Prix recalculés ici (jamais ceux du
 * navigateur). Démonstration : le solde fictif est débité, aucun ticket réel n'est émis.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour acheter un ticket.");
  if (!(await canBuyBargeTickets(user))) return fail(403, "L'achat de tickets de barge n'est pas encore disponible.");
  // Sans gestionnaire des barges branché, un vrai débit ne donnerait aucun ticket : refusé hors démonstration.
  if (!(await usesDemoWallet(user))) return fail(503, NOT_OPEN);

  // Achat lu et vérifié avant de compter un essai : une erreur de saisie ne consomme pas le quota.
  const parsed = purchaseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Achat invalide.");
  if (!bargeDays().includes(parsed.data.day)) return fail(400, "Ce jour n'est plus disponible : choisis-en un autre.");
  const order = priceBargeOrder(parsed.data.cart);
  if (!order) return fail(400, "Ajoute au moins un ticket.");

  // Code de paiement tapé juste à l'instant : sans lui, rien n'est débité (même en appelant l'API).
  if (!(await takePaymentGrant(user.id))) return NextResponse.json(PIN_REQUIRED, { status: 403 });

  try {
    const limit = await consumeRateLimits([{ key: `barge:${user.id}`, rules: RATE_LIMIT_POLICIES.bargeTicket }]);
    if (!limit.allowed) return fail(429, "Trop d'achats d'un coup : réessaie dans une heure.");
  } catch (error) {
    console.error("[barge] Limite de débit indisponible", error);
    return fail(503, "Service momentanément indisponible : réessaie dans un instant.");
  }

  const balanceCents = (await readDemoWallet(user.id)).balanceCents;
  if (balanceCents < order.totalCents) {
    return fail(402, `Solde insuffisant : il te manque ${formatEuros(order.totalCents - balanceCents)}.`);
  }

  const lines = order.lines.map((l) => ({ label: l.ticket.label, detail: l.ticket.detail, emoji: l.ticket.emoji, quantity: l.quantity }));
  const label = `Barge ${BARGE_ROUTE.from} → ${BARGE_ROUTE.to} : ${describeBargeLines(lines)}`.slice(0, 120);
  const paid = await recordDemoOperation(user.id, "payment", order.totalCents, label);
  if (!paid) return fail(402, "Solde insuffisant.");

  const body: BargeTicketBought = {
    ok: true,
    demo: true,
    code: orderCode(),
    day: parsed.data.day,
    lines,
    totalCents: order.totalCents,
    boughtAt: new Date().toISOString(),
  };
  return NextResponse.json(body);
}

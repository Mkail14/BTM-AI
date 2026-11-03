import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { addressSchema, type Address, type SavedAddress } from "@/lib/address";
import { listSavedAddresses } from "@/lib/saved-addresses";
import { getAuthContext } from "@/lib/auth/session";
import { maskPhone, normalizePhone } from "@/lib/code-exam/candidate";
import { canOrderFood } from "@/lib/food/access";
import { rememberOrder } from "@/lib/food/last-order";
import { demoCourier, type Courier } from "@/lib/food/courier";
import { restaurantPoint } from "@/lib/food/route";
import { geocodeAddress, geocodePlace } from "@/lib/geo/geocode";
import type { Point } from "@/lib/geo/communes";
import { orderCode } from "@/lib/food/order-code";
import { FOOD_CATALOG, FOOD_DELIVERY_FEE_CENTS, FOOD_DEMO, FOOD_ZONES, priceOrder, type FoodRestaurant } from "@/lib/food/catalog";
import { getProfileContact, saveProfileAddress, saveProfilePhone } from "@/lib/profile-contact";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { loadWallet, spendFromWallet } from "@/lib/wallet";
import { readDemoWallet, recordDemoOperation } from "@/lib/wallet/demo";
import { formatEuros } from "@/lib/wallet/limits";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/** Ce que renvoie GET : lu par la commande de repas dans la conversation. */
export type FoodResponse = {
  demo: boolean;
  restaurants: FoodRestaurant[];
  zones: readonly string[];
  deliveryCents: number;
  balanceCents: number;
  /** Adresse du compte, à reconfirmer à chaque livraison (null : jamais donnée). */
  address: Address | null;
  /** Carnet d'adresses (travail, amis, famille…), proposé en plus de la maison. */
  savedAddresses: SavedAddress[];
  /** Téléphone enregistré, masqué (« 06 •• •• •• 56 ») : le numéro entier ne revient jamais au navigateur. */
  savedPhone: string | null;
};

/** Restaurants, menus, solde et adresse du compte. 403 si la commande de repas n'est pas ouverte à ce compte. */
export async function GET() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour commander.");
  if (!(await canOrderFood(user))) return fail(403, "La commande de repas n'est pas encore disponible.");
  const [wallet, contact, saved] = await Promise.all([
    // Démonstration : solde fictif (src/lib/wallet/demo.ts), le vrai portefeuille n'est pas touché.
    FOOD_DEMO ? readDemoWallet(user.id) : loadWallet(supabase, user.id, 1),
    getProfileContact(supabase, user.id),
    listSavedAddresses(supabase),
  ]);
  const body: FoodResponse = {
    demo: FOOD_DEMO,
    restaurants: [...FOOD_CATALOG],
    zones: FOOD_ZONES,
    deliveryCents: FOOD_DELIVERY_FEE_CENTS,
    balanceCents: wallet.balanceCents,
    address: contact.address,
    savedAddresses: saved ?? [],
    savedPhone: contact.phone ? maskPhone(contact.phone) : null,
  };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}

const orderSchema = z.object({
  restaurantId: z.string().max(60),
  cart: z.array(z.object({ itemId: z.string().max(60), quantity: z.number().int() })).min(1).max(30),
  address: addressSchema,
  /** Garder cette adresse comme celle du compte (proposé quand elle est corrigée). */
  saveAddress: z.boolean(),
  /** Absent : le numéro enregistré dans le profil. */
  phone: z
    .string()
    .max(30)
    .refine((v) => normalizePhone(v) !== null, "Numéro invalide : 10 chiffres, par exemple 0639 12 34 56.")
    .transform((v) => normalizePhone(v)!)
    .optional(),
  note: z.string().trim().max(200).optional(),
});

/**
 * Paie une commande avec le portefeuille. Prix recalculés ici (jamais ceux du
 * navigateur). Démonstration : aucun restaurant ne reçoit la commande, le
 * solde fictif est débité et le vrai portefeuille n'est pas touché.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return fail(401, "Connecte-toi pour commander.");
  if (!(await canOrderFood(user))) return fail(403, "La commande de repas n'est pas encore disponible.");

  const limit = await consumeRateLimits([{ key: `food:${user.id}`, rules: RATE_LIMIT_POLICIES.foodOrder }]);
  if (!limit.allowed) return fail(429, "Trop de commandes d'un coup : réessaie dans une heure.");

  const parsed = orderSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Commande invalide.");
  const { address, saveAddress } = parsed.data;
  if (!FOOD_ZONES.includes(address.commune)) {
    return fail(400, `On ne livre pas encore à ${address.commune} (seulement ${FOOD_ZONES.join(", ")}).`);
  }
  const order = priceOrder(parsed.data.restaurantId, parsed.data.cart);
  if (!order) return fail(400, "Un plat de ta commande n'existe plus : recommence ton panier.");

  // Carte du suivi : la vraie rue de l'adresse écrite (ou la position GPS donnée, exacte) et le restaurant,
  // cherchés pendant le paiement.
  const places = Promise.all([
    address.geo ? { point: { lat: address.geo.lat, lng: address.geo.lng }, found: true } : geocodeAddress(address.line, address.commune),
    geocodePlace(order.restaurant.name, order.restaurant.commune, restaurantPoint(order.restaurant.id, order.restaurant.commune)),
  ]);

  const contact = await getProfileContact(supabase, user.id);
  const phone = parsed.data.phone ?? contact.phone;
  if (!phone) return fail(400, "Indique ton numéro : le livreur doit pouvoir t'appeler.");

  const balanceCents = (FOOD_DEMO ? await readDemoWallet(user.id) : await loadWallet(supabase, user.id, 1)).balanceCents;
  if (balanceCents < order.totalCents) {
    return fail(402, `Solde insuffisant : il te manque ${formatEuros(order.totalCents - balanceCents)}.`);
  }

  const label = `Repas ${order.restaurant.name}`.slice(0, 120);
  if (FOOD_DEMO) {
    // Démonstration : débit du solde fictif, visible dans le portefeuille.
    if (!(await recordDemoOperation(user.id, "payment", order.totalCents, label))) return fail(402, "Solde insuffisant.");
  } else {
    // Avec un vrai partenaire : débit, puis envoi au restaurant de l'adresse, du lien GPS
    // (mapLink), du téléphone et de la note (remboursement s'il refuse).
    const paid = await spendFromWallet(user.id, order.totalCents, label);
    if (!paid) return fail(402, "Solde insuffisant.");
  }

  // Le profil garde l'adresse et le numéro pour la prochaine fois (sans bloquer la commande).
  await Promise.all([
    saveAddress ? saveProfileAddress(supabase, user.id, address) : null,
    parsed.data.phone && parsed.data.phone !== contact.phone ? saveProfilePhone(supabase, user.id, parsed.data.phone) : null,
  ]).catch((error: unknown) => console.error("[food] Adresse ou téléphone non enregistrés", error));

  // Suivi affiché dans la conversation : préparation, livraison, puis le code. Démonstration :
  // en accéléré (2 minutes) pour le montrer en direct ; sinon, milieu de la fourchette annoncée.
  const [min, max] = order.restaurant.etaMinutes;
  const totalMs = FOOD_DEMO ? DEMO_TRACKING_MS : ((min + max) / 2) * 60_000;
  const now = Date.now();
  const [delivery, restaurantAt] = await places;
  const body: FoodOrderPlaced = {
    ok: true,
    demo: FOOD_DEMO,
    // Code à montrer (QR) ou dicter au livreur. Avec un vrai partenaire, il sera envoyé au restaurant avec la commande.
    code: orderCode(),
    totalCents: order.totalCents,
    placedAt: new Date(now).toISOString(),
    readyAt: new Date(now + totalMs * 0.4).toISOString(),
    arrivesAt: new Date(now + totalMs).toISOString(),
    // Démonstration : un livreur fictif (numéro réservé à la fiction). Avec un partenaire, son vrai livreur.
    courier: FOOD_DEMO ? demoCourier() : null,
    from: restaurantAt,
    to: delivery.point,
    addressFound: delivery.found,
  };
  // Tamilya la retrouve pour répondre aux questions sur la livraison.
  await rememberOrder({
    userId: user.id,
    code: body.code,
    restaurant: order.restaurant.name,
    commune: address.commune,
    lines: order.lines.map((l) => `${l.quantity}× ${l.item.name}`),
    totalCents: order.totalCents,
    note: parsed.data.note || null,
    demo: FOOD_DEMO,
    placedAt: body.placedAt,
    readyAt: body.readyAt,
    arrivesAt: body.arrivesAt,
  });
  return NextResponse.json(body);
}

const DEMO_TRACKING_MS = 2 * 60_000;

/** Ce que renvoie POST : de quoi suivre la commande dans la conversation. */
export type FoodOrderPlaced = {
  ok: true;
  demo: boolean;
  code: string;
  totalCents: number;
  placedAt: string;
  /** Fin de la préparation : le livreur part. */
  readyAt: string;
  arrivesAt: string;
  /** Livreur à appeler ou à qui écrire ; null tant qu'aucun n'est attribué. */
  courier: Courier | null;
  /** Restaurant et lieu de livraison sur la carte, posés sur une route. */
  from: Point;
  to: Point;
  /** Faux : l'adresse écrite n'a pas été trouvée, le point est dans sa commune. */
  addressFound: boolean;
};

import "server-only";
import { cookies } from "next/headers";
import { formatEuros } from "@/lib/wallet/limits";

/**
 * Dernière commande de repas du compte, gardée dans un cookie du navigateur
 * (aucune table de commandes pour l'instant) : Tamilya la reçoit à chaque message
 * pour répondre à « ma livraison arrive quand ? ». Mêmes étapes que le suivi
 * affiché (OrderTracker) : préparation jusqu'à readyAt, livraison jusqu'à arrivesAt.
 */

const COOKIE = "btm_food_order";
/** Après l'arrivée, Tamilya s'en souvient encore un moment (« elle est arrivée ? »). */
const REMEMBER_AFTER_ARRIVAL_MS = 2 * 60 * 60 * 1000;

export type LastOrder = {
  userId: string;
  code: string;
  restaurant: string;
  commune: string;
  lines: string[];
  totalCents: number;
  note: string | null;
  demo: boolean;
  placedAt: string;
  readyAt: string;
  arrivesAt: string;
};

export async function rememberOrder(order: LastOrder) {
  (await cookies()).set(COOKIE, Buffer.from(JSON.stringify(order)).toString("base64url"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
}

/** Commande récente de ce compte, ou null (aucune, autre compte, ou livrée depuis longtemps). */
export async function readLastOrder(userId: string, now = Date.now()): Promise<LastOrder | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  try {
    const order = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as LastOrder;
    if (order.userId !== userId || !Array.isArray(order.lines)) return null;
    if (now - Date.parse(order.arrivesAt) > REMEMBER_AFTER_ARRIVAL_MS) return null;
    return order;
  } catch {
    return null;
  }
}

const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });
const minutes = (ms: number) => {
  const m = Math.max(1, Math.ceil(ms / 60_000));
  return `${m} minute${m > 1 ? "s" : ""}`;
};

/** État de la commande en une ligne de faits, pour le message système de Tamilya. */
export function describeOrder(order: LastOrder, now = Date.now()): string {
  const ready = Date.parse(order.readyAt);
  const arrives = Date.parse(order.arrivesAt);
  const status =
    now < ready
      ? `en préparation au restaurant ; le livreur part vers ${time.format(ready)} (dans ${minutes(ready - now)}) et arrive vers ${time.format(arrives)} (dans ${minutes(arrives - now)})`
      : now < arrives
        ? `en route : le livreur est parti et arrive vers ${time.format(arrives)} (dans ${minutes(arrives - now)})`
        : `livrée vers ${time.format(arrives)}`;
  // Comme à l'écran : le code n'existe qu'une fois la commande reçue par le livreur.
  const codeKnown = now >= ready;
  return [
    `Commande passée à ${time.format(Date.parse(order.placedAt))} chez ${order.restaurant}, livrée à ${order.commune} : ${order.lines.join(", ")} (total payé ${formatEuros(order.totalCents)}).`,
    `État à ${time.format(now)} : ${status}.`,
    codeKnown
      ? `Code de livraison à donner au livreur : ${order.code}.`
      : "Code de livraison : pas encore attribué (il apparaîtra quand le livreur aura reçu la commande). Ne donne aucun code.",
    order.note ? `Mot laissé avec la commande : « ${order.note} ».` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

"use client";

/**
 * Commandes de repas en cours, gardées sur l'appareil (« btm-food-order:<recherche> »).
 * Partagé par le suivi (OrderTracker) et la cloche des notifications, qui ouvre
 * les suivis côte à côte quand on touche une notification de commande.
 */

/** Commandes payées, gardées sur l'appareil : « btm-food-order:<recherche> ». */
export const ORDER_KEY = "btm-food-order:";
/** Une commande arrivée et jamais marquée reçue disparaît d'elle-même après ce délai. */
export const ARRIVED_KEPT_MS = 20 * 60_000;
/** Demande d'ouvrir les suivis en cours (detail : code de la commande touchée). */
export const OPEN_ORDERS_EVENT = "btm-food-open-orders";

type Stored = { code: string; placedAt: string; arrivesAt: string; receivedAt?: string };

/** Commandes en cours (pas encore reçues), de la plus ancienne à la plus récente. */
export function activeOrders<T extends Stored = Stored>(now = Date.now()): T[] {
  const byCode = new Map<string, T>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(ORDER_KEY)) continue;
    try {
      const order = JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
      if (!order?.code || order.receivedAt || Date.parse(order.arrivesAt) + ARRIVED_KEPT_MS < now) continue;
      // Une même commande gardée sous deux recherches : une seule fois.
      const seen = byCode.get(order.code);
      if (!seen || order.placedAt > seen.placedAt) byCode.set(order.code, order);
    } catch {
      // Valeur illisible : ignorée.
    }
  }
  return [...byCode.values()].sort((a, b) => a.placedAt.localeCompare(b.placedAt));
}

/** Notifications du suivi (« <code>:placed », « <code>:pickup »…) : le code de leur commande. */
export function orderCodeOfNotification(id: string): string | null {
  return /^(.+):(?:scheduled|placed|pickup|arrived)$/.exec(id)?.[1] ?? null;
}

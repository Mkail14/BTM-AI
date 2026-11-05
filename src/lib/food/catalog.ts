/**
 * Commande de repas depuis la conversation : restaurants, menus et calcul des
 * commandes.
 *
 * DÉMONSTRATION PRIVÉE : les restaurants et menus sont ceux de Jéjé Livraison
 * (jeje-catalog.ts), repris pour leur présenter le projet. La fonctionnalité
 * n'est visible que des administrateurs (src/lib/food/access.ts) et ne sera
 * jamais publique sans leur accord écrit ; en cas de refus, tout est retiré.
 * Aucune commande n'est transmise aux restaurants.
 */

import type { Point } from "@/lib/geo/communes";
import { DEMO_PAYMENTS } from "@/lib/wallet/demo-mode";
import { groupDeliveryCents, groupRestaurant, MAX_GROUP_STOPS } from "./group-order";
import { JEJE_RESTAURANTS } from "./jeje-catalog";

/** Démonstration (interrupteur commun à tous les paiements : src/lib/wallet/demo-mode.ts). */
export const FOOD_DEMO = DEMO_PAYMENTS;

/** Solde fictif des administrateurs pendant la démonstration : de quoi commander sans recharger. */
export const FOOD_DEMO_BALANCE_CENTS = 15_000;

export type FoodItem = {
  id: string;
  name: string;
  description?: string;
  priceCents: number;
  /** Photo fournie par le restaurant partenaire (sinon, une vignette illustrée). */
  photo?: string;
};
export type FoodSection = { title: string; items: FoodItem[] };
export type FoodRestaurant = {
  id: string;
  name: string;
  kind: string;
  /** Délai de préparation et livraison annoncé, en minutes. */
  etaMinutes: [number, number];
  emoji: string;
  /** Commune du restaurant (une de FOOD_ZONES). */
  commune: string;
  menu: FoodSection[];
};

export const FOOD_CATALOG: readonly FoodRestaurant[] = JEJE_RESTAURANTS;

/**
 * Communes livrées, comparées à la commune de l'adresse du compte (Kawéni et
 * Passamainty sont dans Mamoudzou, Tsararano dans Dembéni).
 */
export const FOOD_ZONES: readonly string[] = ["Mamoudzou", "Koungou", "Dembéni"];

export const FOOD_DELIVERY_FEE_CENTS = 350;
export const FOOD_MAX_QUANTITY = 20;

export type FoodCartLine = { itemId: string; quantity: number };

/** Plats d'un restaurant, par identifiant. */
export function findRestaurant(id: string) {
  return FOOD_CATALOG.find((r) => r.id === id) ?? null;
}

/**
 * Lignes et total d'une commande, avec les prix du catalogue (jamais ceux du
 * navigateur). null si un plat est inconnu ou une quantité invalide.
 */
export function priceOrder(restaurantId: string, cart: readonly FoodCartLine[]) {
  const restaurant = findRestaurant(restaurantId);
  if (!restaurant || cart.length === 0) return null;
  const items = new Map(restaurant.menu.flatMap((s) => s.items).map((i) => [i.id, i]));
  // Un même plat envoyé sur plusieurs lignes est additionné avant de vérifier la quantité maximale.
  const merged = new Map<string, number>();
  for (const { itemId, quantity } of cart) {
    if (!Number.isInteger(quantity) || quantity < 1) return null;
    merged.set(itemId, (merged.get(itemId) ?? 0) + quantity);
  }
  const lines = [];
  for (const [itemId, quantity] of merged) {
    const item = items.get(itemId);
    if (!item || quantity > FOOD_MAX_QUANTITY) return null;
    lines.push({ item, quantity, totalCents: item.priceCents * quantity });
  }
  const itemsCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  return { restaurant, lines, itemsCents, deliveryCents: FOOD_DELIVERY_FEE_CENTS, totalCents: itemsCents + FOOD_DELIVERY_FEE_CENTS };
}

/**
 * Commande groupée : même forme que priceOrder, chaque restaurant aux prix du
 * catalogue et la livraison recalculée d'après le trajet. null si un restaurant
 * ou un plat est inconnu, ou si un restaurant est cité deux fois.
 */
export function priceGroupOrder(stops: readonly { restaurantId: string; cart: readonly FoodCartLine[] }[], client: Point | null) {
  if (stops.length < 2 || stops.length > MAX_GROUP_STOPS || new Set(stops.map((s) => s.restaurantId)).size !== stops.length) return null;
  const orders = [];
  for (const stop of stops) {
    const order = priceOrder(stop.restaurantId, stop.cart);
    if (!order) return null;
    orders.push(order);
  }
  const restaurants = orders.map((o) => o.restaurant);
  const itemsCents = orders.reduce((sum, o) => sum + o.itemsCents, 0);
  const deliveryCents = groupDeliveryCents(restaurants, client, FOOD_DELIVERY_FEE_CENTS);
  return { restaurant: groupRestaurant(restaurants), lines: orders.flatMap((o) => o.lines), itemsCents, deliveryCents, totalCents: itemsCents + deliveryCents };
}

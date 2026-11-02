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

import { JEJE_RESTAURANTS } from "./jeje-catalog";

export const FOOD_DEMO = true;

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
  const lines = [];
  for (const { itemId, quantity } of cart) {
    const item = items.get(itemId);
    if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > FOOD_MAX_QUANTITY) return null;
    lines.push({ item, quantity, totalCents: item.priceCents * quantity });
  }
  const itemsCents = lines.reduce((sum, l) => sum + l.totalCents, 0);
  return { restaurant, lines, itemsCents, deliveryCents: FOOD_DELIVERY_FEE_CENTS, totalCents: itemsCents + FOOD_DELIVERY_FEE_CENTS };
}

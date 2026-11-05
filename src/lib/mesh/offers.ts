import { BARGE_ROUTE, describeBargeLines, mayotteDay, priceBargeOrder } from "@/lib/barge/catalog";
import { detectBargeTicket, parseBargeRequest } from "@/lib/barge/intent";
import { FOOD_CATALOG, priceOrder, type FoodRestaurant } from "@/lib/food/catalog";
import { detectFoodOrder } from "@/lib/food/intent";
import { dishKindOf, matchFoodQuery } from "@/lib/food/match";
import { formatEuros } from "@/lib/wallet/limits";

/**
 * Choix proposés sans internet (Tamilya Connect) : pas de tableau ni de carte,
 * seulement des boutons « Payer … » dont le prix est fixé ici, par le serveur.
 */

export type Offer = { kind: "barge" | "food"; label: string; data: Record<string, unknown> };

export const MAX_FOOD_OFFERS = 3;

/** Billet de barge demandé : aujourd'hui, ou demain si c'est dit. */
export function bargeOffer(message: string): Offer | null {
  if (detectBargeTicket(message) !== "buy") return null;
  const cart = Object.entries(parseBargeRequest(message)).map(([ticketId, quantity]) => ({ ticketId, quantity }));
  const order = priceBargeOrder(cart);
  if (!order) return null;
  const tomorrow = /\bdemain\b/i.test(message);
  const day = mayotteDay(tomorrow ? 1 : 0);
  const what = describeBargeLines(order.lines.map((l) => ({ label: l.ticket.label, detail: l.ticket.detail, quantity: l.quantity })));
  return {
    kind: "barge",
    label: `Barge ${BARGE_ROUTE.from} → ${BARGE_ROUTE.to}, ${tomorrow ? "demain" : "aujourd'hui"} : ${what} · ${formatEuros(order.totalCents)}`.slice(0, 160),
    data: { day, cart },
  };
}

function dishes(restaurants: readonly FoodRestaurant[], kind: string | null) {
  return restaurants.flatMap((restaurant) =>
    restaurant.menu.flatMap((section) =>
      section.items.filter((item) => !kind || dishKindOf(item, section.title, restaurant.kind) === kind).map((item) => ({ restaurant, item })),
    ),
  );
}

/**
 * Plats proposés (3 au plus, livrés à l'adresse du compte, dès que possible).
 * Envie vague (« j'ai faim ») : aucun plat, Tamilya demande ce qui fait envie.
 */
export function foodOffers(message: string, earlier: readonly string[], catalog: readonly FoodRestaurant[] = FOOD_CATALOG): Offer[] {
  const query = detectFoodOrder(message, earlier, catalog);
  if (!query || query === "tout") return [];
  const match = matchFoodQuery(query, catalog);
  const restaurants = match.restaurantId ? catalog.filter((r) => r.id === match.restaurantId) : catalog;
  // Un restaurant cité sans plat : ses premiers plats.
  if (!match.kind && !match.restaurantId) return [];
  return dishes(restaurants, match.kind)
    .slice(0, MAX_FOOD_OFFERS)
    .flatMap(({ restaurant, item }) => {
      const order = priceOrder(restaurant.id, [{ itemId: item.id, quantity: 1 }]);
      if (!order) return [];
      return [
        {
          kind: "food" as const,
          label: `${item.name} — ${restaurant.name} · ${formatEuros(order.totalCents)} livraison comprise`.slice(0, 160),
          data: { restaurantId: restaurant.id, itemId: item.id },
        },
      ];
    });
}

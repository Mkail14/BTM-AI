/**
 * Commande de repas depuis la conversation : restaurants, menus et calcul des
 * commandes.
 *
 * PROTOTYPE : restaurants et plats FICTIFS, écrits pour la démonstration (aucun
 * menu ni prix repris d'une plateforme existante). La fonctionnalité n'est
 * visible que des administrateurs (src/lib/food/access.ts) tant qu'aucun
 * partenaire n'a donné son accord. Le jour où un partenaire fournit ses menus,
 * seule FOOD_CATALOG change : l'API, le parcours et le paiement restent.
 */

export const FOOD_DEMO = true;

export type FoodItem = { id: string; name: string; description?: string; priceCents: number };
export type FoodSection = { title: string; items: FoodItem[] };
export type FoodRestaurant = {
  id: string;
  name: string;
  kind: string;
  /** Délai de préparation et livraison annoncé, en minutes. */
  etaMinutes: [number, number];
  emoji: string;
  menu: FoodSection[];
};

export const FOOD_CATALOG: readonly FoodRestaurant[] = [
  {
    id: "kebab-du-lagon",
    name: "Kebab du Lagon",
    kind: "Kebab",
    etaMinutes: [25, 40],
    emoji: "🥙",
    menu: [
      {
        title: "Sandwichs",
        items: [
          { id: "kebab-classique", name: "Kebab classique", description: "Viande, salade, tomate, oignon", priceCents: 750 },
          { id: "kebab-galette", name: "Galette kebab", description: "Roulé dans une galette", priceCents: 800 },
          { id: "kebab-poulet", name: "Kebab poulet", description: "Poulet mariné, crudités", priceCents: 750 },
        ],
      },
      {
        title: "Assiettes",
        items: [
          { id: "assiette-kebab", name: "Assiette kebab", description: "Viande, frites, salade", priceCents: 1100 },
          { id: "assiette-mixte", name: "Assiette mixte", description: "Viande et poulet, frites", priceCents: 1250 },
        ],
      },
      {
        title: "À côté",
        items: [
          { id: "frites", name: "Frites", priceCents: 300 },
          { id: "soda", name: "Soda 33 cl", priceCents: 250 },
          { id: "jus-local", name: "Jus local", description: "Goyave ou maracuja", priceCents: 300 },
        ],
      },
    ],
  },
  {
    id: "pizza-mangrove",
    name: "Pizza Mangrove",
    kind: "Pizza",
    etaMinutes: [35, 50],
    emoji: "🍕",
    menu: [
      {
        title: "Pizzas",
        items: [
          { id: "pizza-tomate", name: "Tomate fromage", description: "Tomate, fromage, origan", priceCents: 900 },
          { id: "pizza-poulet-coco", name: "Poulet coco", description: "Crème, poulet, lait de coco, oignon", priceCents: 1200 },
          { id: "pizza-thon", name: "Thon", description: "Tomate, thon, oignon, olives", priceCents: 1150 },
          { id: "pizza-4-fromages", name: "Quatre fromages", priceCents: 1300 },
        ],
      },
      {
        title: "Boissons",
        items: [
          { id: "pizza-soda", name: "Soda 33 cl", priceCents: 250 },
          { id: "pizza-eau", name: "Eau 50 cl", priceCents: 150 },
        ],
      },
    ],
  },
  {
    id: "brochettes-976",
    name: "Brochettes 976",
    kind: "Mahorais",
    etaMinutes: [30, 45],
    emoji: "🍢",
    menu: [
      {
        title: "Plats",
        items: [
          { id: "brochettes-boeuf", name: "Brochettes de bœuf", description: "Avec bananes frites", priceCents: 1000 },
          { id: "poulet-grille", name: "Poulet grillé", description: "Avec manioc", priceCents: 1100 },
          { id: "mataba", name: "Mataba", description: "Feuilles de manioc au coco, riz", priceCents: 900 },
        ],
      },
      {
        title: "Boissons",
        items: [{ id: "brochettes-jus", name: "Jus local", priceCents: 300 }],
      },
    ],
  },
];

/** Communes livrées (centre et nord de Grande-Terre). */
export const FOOD_ZONES = ["Mamoudzou", "Kawéni", "Koungou", "Passamainty", "Tsararano"] as const;

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

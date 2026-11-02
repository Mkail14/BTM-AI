/**
 * Ce que la personne veut manger, lu dans le bloc ```commande-repas``` écrit
 * par Awa (« tacos », « pizza Pizza Mangrove »…) : un type de plat, un
 * restaurant, ou les deux. Sans rien de reconnu, la commande montre tout.
 */

export type DishKind = { id: string; label: string; emoji: string; pattern: RegExp };

/** Types de plats reconnus, du plus précis au plus général. */
export const DISH_KINDS: readonly DishKind[] = [
  { id: "tacos", label: "Tacos", emoji: "🌮", pattern: /\btacos?\b/ },
  { id: "pizza", label: "Pizzas", emoji: "🍕", pattern: /\bpizz?as?\b/ },
  { id: "burger", label: "Burgers", emoji: "🍔", pattern: /\b(?:burgers?|hamburgers?|cheese ?burgers?)\b/ },
  { id: "kebab", label: "Kebabs", emoji: "🥙", pattern: /\b(?:kebabs?|grecs?|galettes?|durum)\b/ },
  { id: "mahorais", label: "Plats mahorais", emoji: "🍢", pattern: /\b(?:mahorais|mataba|madaba|manioc|brochettes?|mabawa|pilao|bananes? frites?|voule)\b/ },
  { id: "poulet", label: "Poulet", emoji: "🍗", pattern: /\b(?:poulets?|ailes?|wings|nuggets?|tenders?)\b/ },
  { id: "dessert", label: "Desserts", emoji: "🍰", pattern: /\b(?:desserts?|gateaux?|glaces?|tiramisu|crepes?)\b/ },
  { id: "boisson", label: "Boissons", emoji: "🥤", pattern: /\b(?:boissons?|jus|sodas?|eau|coca)\b/ },
];

export const normalizeFood = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Mots qui ne désignent pas un restaurant (« pizza » dans « Pizza Mangrove »). */
const GENERIC = new Set(["le", "la", "les", "du", "de", "des", "chez", "restaurant", "resto", "snack", ...DISH_KINDS.flatMap((k) => k.id)]);

/** Type d'un plat, d'après son nom, sa description et sa rubrique (sinon, le type du restaurant). */
export function dishKindOf(item: { name: string; description?: string }, section: string, restaurantKind: string): string | null {
  const own = ` ${normalizeFood(`${item.name} ${item.description ?? ""}`)} `;
  const byName = DISH_KINDS.find((k) => k.pattern.test(` ${normalizeFood(item.name)} `)) ?? DISH_KINDS.find((k) => k.pattern.test(own));
  if (byName) return byName.id;
  const context = ` ${normalizeFood(`${section} ${restaurantKind}`)} `;
  return DISH_KINDS.find((k) => k.pattern.test(context))?.id ?? null;
}

export type FoodQuery ={ kind: string | null; restaurantId: string | null };

/** Type de plat et restaurant cherchés. Un restaurant est reconnu par un mot distinctif de son nom. */
export function matchFoodQuery(query: string, restaurants: readonly { id: string; name: string }[]): FoodQuery {
  const text = ` ${normalizeFood(query)} `;
  const kind = DISH_KINDS.find((k) => k.pattern.test(text))?.id ?? null;
  const restaurant = restaurants.find((r) =>
    normalizeFood(r.name)
      .split(" ")
      .filter((word) => word.length >= 3 && !GENERIC.has(word) && !GENERIC.has(word.replace(/s$/, "")))
      .some((word) => text.includes(` ${word} `)),
  );
  return { kind, restaurantId: restaurant?.id ?? null };
}

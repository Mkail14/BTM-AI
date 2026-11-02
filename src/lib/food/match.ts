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
  { id: "sandwich", label: "Sandwichs", emoji: "🥪", pattern: /\b(?:sandwich\w*|paninis?|baguettes?|bokits?)\b/ },
  { id: "mahorais", label: "Plats mahorais", emoji: "🍢", pattern: /\b(?:mahorais|mataba|madaba|manioc|brochettes?|mabawa|pilao|bananes? frites?|voule)\b/ },
  { id: "asiatique", label: "Asiatique", emoji: "🥢", pattern: /\b(?:asiatiques?|chinois(?:es?)?|nems?|nouilles|mines|cantonnais|[cs]hop ?suey|bol renverse|wane? ?tane?|gyozas?|dim sum|fuyung|sushis?)\b/ },
  { id: "poulet", label: "Poulet", emoji: "🍗", pattern: /\b(?:poulets?|ailes?|wings|nuggets?|tenders?)\b/ },
  { id: "accompagnement", label: "Frites et à-côtés", emoji: "🍟", pattern: /\b(?:frites?|fries|potatoes|barquettes?|salades?)\b/ },
  { id: "dessert", label: "Desserts", emoji: "🍰", pattern: /\b(?:desserts?|gateaux?|glaces?|tiramisu|crepes?|milk ?shakes?)\b/ },
  {
    id: "boisson",
    label: "Boissons",
    emoji: "🥤",
    pattern:
      /\b(?:boissons?|jus|sodas?|eau|coca|sprite|fanta|oasis|orangina|perrier|schweppes|seven|7 ?up|monster|red ?bull|ice ?tea|lipton|cafe|cafe au lait|the|cappuccino|chocolat chaud)\b/,
  },
];

export const normalizeFood = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Mots qui ne désignent pas un restaurant à eux seuls (« pizza » dans « Jéjé
 * pizza Mamoudzou », la commune, les mots courants).
 */
const GENERIC = new Set([
  "le", "la", "les", "du", "de", "des", "chez", "restaurant", "resto", "snack", "food", "cuisine", "traiteur", "top", "good", "eat",
  "mamoudzou", "koungou", "dembeni", "kaweni", "passamainty", "tsararano",
  ...DISH_KINDS.map((k) => k.id),
]);

/** Mot sans s final, pour que « délice » trouve « Délices ». */
const stem = (word: string) => word.replace(/s$/, "");

/**
 * Type d'un plat, d'après son nom, puis sa description, puis sa rubrique. Le
 * type du restaurant ne sert que s'il n'en désigne qu'un : chez « Snack,
 * petit-déjeuner, tacos », un café au lait n'est pas un tacos.
 */
export function dishKindOf(item: { name: string; description?: string }, section: string, restaurantKind: string): string | null {
  const find = (text: string) => DISH_KINDS.find((k) => k.pattern.test(` ${normalizeFood(text)} `))?.id ?? null;
  const own = find(item.name) ?? find(item.description ?? "") ?? find(section);
  if (own) return own;
  const kinds = DISH_KINDS.filter((k) => k.pattern.test(` ${normalizeFood(restaurantKind)} `));
  return kinds.length === 1 && !/snack|fast ?food|petit dejeuner/.test(normalizeFood(restaurantKind)) ? kinds[0].id : null;
}

export type FoodQuery ={ kind: string | null; restaurantId: string | null };

/**
 * Type de plat et restaurant cherchés. Un restaurant est reconnu par les mots
 * distinctifs de son nom : celui dont le plus de mots sont cités l'emporte
 * (« brochette mangrove » : BROCHETTE MANGROVE, pas Pizza Mangrove), à égalité
 * celui qui sert le plat demandé (« jéjé pizza » : Jéjé pizza, pas Jéjé kebab).
 */
export function matchFoodQuery(query: string, restaurants: readonly { id: string; name: string; kind: string }[]): FoodQuery {
  const text = ` ${normalizeFood(query)} `;
  const words = new Set(text.trim().split(" ").map(stem));
  const kind = DISH_KINDS.find((k) => k.pattern.test(text)) ?? null;
  let best: { id: string; score: number } | null = null;
  for (const r of restaurants) {
    const own = normalizeFood(r.name)
      .split(" ")
      .map(stem)
      .filter((word) => word.length >= 3 && !GENERIC.has(word));
    const found = own.filter((word) => words.has(word)).length;
    if (!found) continue;
    const score = found + (kind?.pattern.test(` ${normalizeFood(`${r.name} ${r.kind}`)} `) ? 0.5 : 0);
    if (!best || score > best.score) best = { id: r.id, score };
  }
  return { kind: kind?.id ?? null, restaurantId: best?.id ?? null };
}

/**
 * Photos d'illustration (créées pour la démonstration, dans public/food) des
 * plats que le restaurant n'a pas photographiés. Du plus précis au plus général ;
 * sans correspondance, la vignette illustrée reste.
 */
const ILLUSTRATIONS: readonly [RegExp, string][] = [
  // Plats qui ressembleraient trop peu à l'image de leur rubrique.
  [/\b(?:biryani|jus|cafe au lait|the marrakech|cappuccino|milkshake|salades?|assiettes?|brochet\w*|milanaise)\b/, ""],
  [/\b(?:pizz?as?|calzone|regina|margherita)\b/, "/food/pizza.webp"],
  [/\b(?:\w*burgers?)\b/, "/food/burger.webp"],
  [/\btacos?\b/, "/food/tacos.webp"],
  [/\b(?:sandwich\w*|paninis?|baguettes?)\b/, "/food/sandwich.webp"],
  [/\b(?:crousty|poulets?|cuisses?|ailes?|wings|nuggets?|panes?|tenders?|chicken)\b/, "/food/poulet.webp"],
  [/\b(?:frites?|fries)\b/, "/food/frites.webp"],
  [/\b(?:boissons?|coca|sprite|fanta|oasis|orangina|schweppes|eau|pepsi|red ?bull|monster|7 ?up|seven|lipton|capri|perrier|sambo)\b/, "/food/boisson.webp"],
];

export function illustrationOf(item: { name: string }, section: string): string | null {
  for (const text of [` ${normalizeFood(item.name)} `, ` ${normalizeFood(section)} `]) {
    const found = ILLUSTRATIONS.find(([pattern]) => pattern.test(text));
    if (found) return found[1] || null;
  }
  return null;
}

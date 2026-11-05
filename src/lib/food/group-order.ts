import { COMMUNE_CENTERS, distanceKm, type Point } from "@/lib/geo/communes";
import type { FoodCartLine, FoodItem, FoodRestaurant } from "./catalog";
import { DISH_KINDS, dishKindOf, matchFoodQuery, normalizeFood } from "./match";
import { restaurantPoint } from "./route";

/**
 * Commande groupée : Tamilya compose elle-même le panier d'une demande à
 * plusieurs articles (« un tacos merguez et de l'eau »). Un seul restaurant
 * s'il a tout ; sinon le reste vient d'un autre, si la personne accepte le
 * détour. Un seul livreur, un seul paiement, une seule livraison.
 *
 * Utilisable côté navigateur (aperçu) et serveur (prix recalculés au paiement) :
 * ce fichier n'importe pas le catalogue, on le lui passe.
 */

/** Détour d'une commande groupée : par restaurant en plus, et par km ajouté au trajet. */
export const GROUP_STOP_FEE_CENTS = 150;
export const GROUP_KM_FEE_CENTS = 50;
/** Temps ajouté au délai annoncé, par restaurant en plus. */
const GROUP_STOP_MINUTES = 10;
export const MAX_GROUP_STOPS = 3;
const MAX_WISHES = 8;

export type Wish = { text: string; kind: string; quantity: number };

const NUMBERS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };
/** Mots sans valeur pour chercher un plat : articles, envie, politesse. */
const NOISE = new Set(
  "a au aux avec boisson chez commande commander d de de des donne du et il j je l la le les me moi mon ma me plait pour plus prend s stp svp te veux voudrai aussi apporte ramene bouteille canette verre envie".split(" "),
);

const stem = (word: string) => word.replace(/s$/, "");
const isNumber = (word: string) => /^\d+$/.test(word) || word in NUMBERS;

/** Une lettre d'écart au plus, pour les mots longs : « mergez » trouve « merguez ». */
function close(a: string, b: string) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  const [long, short] = a.length >= b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && long[i] === short[i]) i++;
  return long.length === short.length ? long.slice(i + 1) === short.slice(i + 1) : long.slice(i + 1) === short.slice(i);
}

const wordsOf = (text: string) => normalizeFood(text).split(" ").filter(Boolean).map(stem);
const kindIn = (text: string) => DISH_KINDS.find((k) => k.pattern.test(` ${text} `)) ?? null;

/** Rang du mot qui nomme le plat : la quantité est avant lui (« deux tacos »), le reste est une précision. */
const kindWordAt = (words: readonly string[], kind: { pattern: RegExp }) => words.findIndex((word) => kind.pattern.test(` ${word} `));

function quantityOf(text: string, kind: { pattern: RegExp }) {
  const words = text.split(" ");
  for (const word of words.slice(0, Math.max(0, kindWordAt(words, kind))).reverse()) {
    const value = /^\d+$/.test(word) ? Number(word) : NUMBERS[word];
    if (value) return Math.min(value, 20);
  }
  return 1;
}

/**
 * Découpe une demande en articles. Un morceau sans plat reconnu complète
 * l'article d'avant (« trois sauces ») ; après « avec », des frites aussi.
 */
export function parseWishes(message: string): Wish[] {
  const wishes: Wish[] = [];
  for (const line of message.split(/[,+;\n]/)) {
    const pieces = normalizeFood(line).split(/ (et|avec|plus) /);
    pieces.forEach((piece, index) => {
      if (index % 2 === 1) return;
      const kind = kindIn(piece);
      const previous = wishes[wishes.length - 1];
      const detail = !kind || (pieces[index - 1] === "avec" && kind.id === "accompagnement");
      if (detail && previous) previous.text = `${previous.text} ${piece}`.slice(0, 80);
      else if (kind) wishes.push({ text: piece.slice(0, 80), kind: kind.id, quantity: quantityOf(piece, kind) });
    });
  }
  return wishes.slice(0, MAX_WISHES);
}

/** Contenu du bloc ```commande-groupee``` (null : moins de deux articles). */
export function groupSpec(message: string): string | null {
  const wishes = parseWishes(message);
  return wishes.length >= 2 ? wishes.map((w) => w.text).join("\n") : null;
}

export const clientPoint = (commune: string | null | undefined, geo?: Point | null): Point | null => geo ?? (commune ? (COMMUNE_CENTERS[commune] ?? null) : null);

const pointOf = (r: FoodRestaurant) => restaurantPoint(r.id, r.commune);

/** Plus court passage par tous les restaurants, jusqu'à la personne. */
function tourKm(restaurants: readonly FoodRestaurant[], client: Point | null): number {
  const walk = (at: Point, left: readonly FoodRestaurant[]): number => {
    if (!left.length) return client ? distanceKm(at, client) : 0;
    return Math.min(...left.map((r) => distanceKm(at, pointOf(r)) + walk(pointOf(r), left.filter((o) => o !== r))));
  };
  return Math.min(...restaurants.map((r) => walk(pointOf(r), restaurants.filter((o) => o !== r))));
}

/** Livraison : le prix habituel, plus chaque restaurant en plus et chaque km de détour. */
export function groupDeliveryCents(restaurants: readonly FoodRestaurant[], client: Point | null, baseCents: number): number {
  if (restaurants.length < 2) return baseCents;
  const direct = client ? Math.min(...restaurants.map((r) => distanceKm(pointOf(r), client))) : 0;
  const extraKm = Math.max(0, tourKm(restaurants, client) - direct);
  const detour = (restaurants.length - 1) * GROUP_STOP_FEE_CENTS + extraKm * GROUP_KM_FEE_CENTS;
  return baseCents + Math.ceil(detour / 10) * 10;
}

/** Plusieurs restaurants présentés comme un seul au paiement et au suivi. */
export function groupRestaurant(restaurants: readonly FoodRestaurant[]): FoodRestaurant {
  const extra = (restaurants.length - 1) * GROUP_STOP_MINUTES;
  return {
    id: restaurants[0].id,
    name: restaurants.map((r) => r.name).join(" + "),
    kind: "Commande groupée",
    etaMinutes: [Math.max(...restaurants.map((r) => r.etaMinutes[0])) + extra, Math.max(...restaurants.map((r) => r.etaMinutes[1])) + extra],
    emoji: "🛵",
    commune: restaurants[0].commune,
    menu: restaurants.flatMap((r) => r.menu),
  };
}

export type GroupPick = { wish: Wish; item: FoodItem; quantity: number };
export type GroupStop = { restaurant: FoodRestaurant; picks: GroupPick[] };
export type GroupPlan = { stops: GroupStop[]; missing: Wish[] };

type Candidate = { restaurant: FoodRestaurant; item: FoodItem; hits: number };

/** Le meilleur plat de chaque restaurant pour cet article (autant de mots du nom que le mieux placé). */
function candidatesFor(wish: Wish, restaurants: readonly FoodRestaurant[]): Candidate[] {
  const wanted = wordsOf(wish.text).filter((word) => !NOISE.has(word) && !isNumber(word));
  const named = matchFoodQuery(wish.text, restaurants).restaurantId;
  const scored = restaurants.flatMap((restaurant) => {
    if (named && restaurant.id !== named) return [];
    const found = restaurant.menu.flatMap((section) =>
      section.items.flatMap((item) => {
        if (dishKindOf(item, section.title, restaurant.kind) !== wish.kind) return [];
        const name = wordsOf(item.name);
        const description = wordsOf(item.description ?? "");
        const hits = wanted.filter((word) => name.some((w) => close(w, word))).length;
        const near = wanted.filter((word) => description.some((w) => close(w, word))).length;
        return hits + near > 0 || !wanted.length ? [{ restaurant, item, hits, near }] : [];
      }),
    );
    const best = found.sort((a, b) => b.hits - a.hits || b.near - a.near || a.item.priceCents - b.item.priceCents)[0];
    return best ? [best] : [];
  });
  const top = Math.max(0, ...scored.map((c) => c.hits));
  return scored.filter((c) => c.hits === top);
}

/**
 * Le plan : d'abord le restaurant qui a le plus d'articles (à égalité celui qui
 * a le premier demandé, puis le plus proche, puis le moins cher), puis les
 * restaurants nécessaires pour le reste, au plus MAX_GROUP_STOPS.
 */
export function planGroupOrder(wishes: readonly Wish[], restaurants: readonly FoodRestaurant[], client: Point | null): GroupPlan {
  const options = new Map(wishes.map((wish) => [wish, candidatesFor(wish, restaurants)]));
  const left = wishes.filter((wish) => options.get(wish)?.length);
  const missing = wishes.filter((wish) => !options.get(wish)?.length);
  const stops: GroupStop[] = [];
  while (left.length && stops.length < MAX_GROUP_STOPS) {
    const last = stops[stops.length - 1];
    const anchor = last ? pointOf(last.restaurant) : client;
    const best = restaurants
      .map((restaurant) => {
        const picks = left.flatMap((wish) => {
          const found = options.get(wish)?.find((c) => c.restaurant.id === restaurant.id);
          return found ? [{ wish, item: found.item, quantity: wish.quantity }] : [];
        });
        return {
          restaurant,
          picks,
          first: picks.some((p) => p.wish === left[0]) ? 1 : 0,
          km: anchor ? distanceKm(anchor, pointOf(restaurant)) : 0,
          cents: picks.reduce((sum, p) => sum + p.item.priceCents * p.quantity, 0),
        };
      })
      .filter((r) => r.picks.length)
      .sort((a, b) => b.picks.length - a.picks.length || b.first - a.first || a.km - b.km || a.cents - b.cents)[0];
    stops.push({ restaurant: best.restaurant, picks: best.picks });
    for (const pick of best.picks) left.splice(left.indexOf(pick.wish), 1);
  }
  return { stops, missing: [...missing, ...left] };
}

export const stopCart = (stop: GroupStop): FoodCartLine[] => stop.picks.map((p) => ({ itemId: p.item.id, quantity: p.quantity }));

/** Ce que la personne a précisé et qu'aucun plat ne porte (« trois sauces ») : gardé dans le mot au restaurant. */
export function pickNote(pick: GroupPick): string | null {
  const kind = DISH_KINDS.find((k) => k.id === pick.wish.kind);
  const words = pick.wish.text.split(" ");
  const named = kind ? kindWordAt(words, kind) : 0;
  const name = wordsOf(pick.item.name);
  const extra = words.filter((word, index) => {
    if (index <= named || NOISE.has(stem(word))) return false;
    return !name.some((w) => close(w, stem(word)));
  });
  return extra.length ? `${pick.item.name} : ${extra.join(" ")}` : null;
}

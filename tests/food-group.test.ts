import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FOOD_CATALOG, FOOD_DELIVERY_FEE_CENTS, priceGroupOrder, type FoodRestaurant } from "@/lib/food/catalog";
import { groupDeliveryCents, groupSpec, parseWishes, pickNote, planGroupOrder, stopCart } from "@/lib/food/group-order";
import { COMMUNE_CENTERS } from "@/lib/geo/communes";

const dish = (id: string, name: string, priceCents = 500) => ({ id, name, priceCents });
const place = (id: string, commune: string, items: ReturnType<typeof dish>[]): FoodRestaurant => ({
  id,
  name: id,
  kind: "Snack",
  etaMinutes: [20, 30],
  emoji: "🍽️",
  commune,
  menu: [{ title: "Carte", items }],
});
const taco = place("alpha", "Mamoudzou", [dish("t1", "TACOS MERGUEZ", 700), dish("t2", "TACOS POULET", 650)]);
const water = place("beta", "Koungou", [dish("e1", "EAU 50cl", 150)]);
const both = place("gamma", "Dembéni", [dish("b1", "TACOS MERGUEZ", 800), dish("b2", "EAU 50cl", 200)]);
const home = COMMUNE_CENTERS.Mamoudzou;

describe("commande groupée", () => {
  it("découpe la demande et garde les précisions avec leur plat", () => {
    const wishes = parseWishes("je veux un tacos mergez trois sauce et de l'eau");
    assert.deepEqual(wishes.map((w) => w.kind), ["tacos", "boisson"]);
    assert.equal(parseWishes("deux pizzas, un coca")[0].quantity, 2);
    assert.equal(parseWishes("un tacos avec trois sauces").length, 1);
    assert.equal(parseWishes("un tacos avec des frites").length, 1);
    assert.equal(groupSpec("un tacos"), null);
  });

  it("reste chez un seul restaurant s'il a tout", () => {
    const plan = planGroupOrder(parseWishes("tacos merguez et eau"), [taco, water, both], home);
    assert.deepEqual(plan.stops.map((s) => s.restaurant.id), ["gamma"]);
    assert.equal(plan.missing.length, 0);
  });

  it("va chercher ailleurs ce que le restaurant n'a pas", () => {
    const plan = planGroupOrder(parseWishes("tacos mergez trois sauce et de l'eau"), [taco, water], home);
    assert.deepEqual(plan.stops.map((s) => s.restaurant.id), ["alpha", "beta"]);
    assert.equal(plan.stops[0].picks[0].item.id, "t1");
    assert.equal(pickNote(plan.stops[0].picks[0]), "TACOS MERGUEZ : trois sauce");
    assert.equal(pickNote(plan.stops[1].picks[0]), null);
    assert.deepEqual(stopCart(plan.stops[1]), [{ itemId: "e1", quantity: 1 }]);
  });

  it("dit ce qu'il n'a trouvé nulle part", () => {
    const plan = planGroupOrder(parseWishes("tacos et pizza"), [taco], home);
    assert.deepEqual(plan.missing.map((w) => w.kind), ["pizza"]);
  });

  it("fait payer le détour : plus c'est loin, plus c'est cher", () => {
    const near = groupDeliveryCents([taco, place("voisin", "Mamoudzou", [])], home, FOOD_DELIVERY_FEE_CENTS);
    const far = groupDeliveryCents([taco, water], home, FOOD_DELIVERY_FEE_CENTS);
    assert.equal(groupDeliveryCents([taco], home, FOOD_DELIVERY_FEE_CENTS), FOOD_DELIVERY_FEE_CENTS);
    assert.ok(near > FOOD_DELIVERY_FEE_CENTS);
    assert.ok(far > near);
  });

  it("recalcule tout avec les prix du catalogue, sans doublon", () => {
    const [a, b] = FOOD_CATALOG;
    const cart = (r: FoodRestaurant) => [{ itemId: r.menu[0].items[0].id, quantity: 1 }];
    const order = priceGroupOrder([{ restaurantId: a.id, cart: cart(a) }, { restaurantId: b.id, cart: cart(b) }], home);
    assert.ok(order);
    assert.equal(order.totalCents, a.menu[0].items[0].priceCents + b.menu[0].items[0].priceCents + order.deliveryCents);
    assert.equal(priceGroupOrder([{ restaurantId: a.id, cart: cart(a) }, { restaurantId: a.id, cart: cart(a) }], home), null);
    assert.equal(priceGroupOrder([{ restaurantId: a.id, cart: cart(a) }, { restaurantId: "inconnu", cart: cart(a) }], home), null);
  });

  it("trouve un tacos et de l'eau dans le vrai catalogue", () => {
    const plan = planGroupOrder(parseWishes("tacos merguez trois sauces et de l'eau"), FOOD_CATALOG, home);
    assert.equal(plan.missing.length, 0);
  });
});

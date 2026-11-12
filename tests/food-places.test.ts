import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isInMayotte } from "@/lib/address";
import { FOOD_CATALOG } from "@/lib/food/catalog";
import { kmToRestaurant, RESTAURANT_SPOTS, restaurantPlace } from "@/lib/food/places";
import { findVillage } from "@/lib/geo/villages";

describe("position des restaurants", () => {
  it("chaque restaurant placé existe et se trouve à Mayotte", () => {
    for (const [id, spot] of Object.entries(RESTAURANT_SPOTS)) {
      assert.ok(FOOD_CATALOG.some((r) => r.id === id), `restaurant inconnu : ${id}`);
      assert.ok(isInMayotte(spot.lat, spot.lng), `hors de Mayotte : ${id}`);
    }
  });

  it("position exacte avec son quartier, sinon le centre de la commune", () => {
    const kebab = restaurantPlace({ id: "kebab-house", commune: "Mamoudzou" });
    assert.equal(kebab?.exact, true);
    assert.equal(kebab?.label, "Kawéni");
    assert.equal(restaurantPlace({ id: "inconnu", commune: "Mamoudzou" })?.exact, false);
  });

  it("depuis Kawéni, Kebab House passe avant Jéjé kebab ; la barge compte depuis Petite-Terre", () => {
    const home = findVillage("Kawéni")!.point;
    const kebab = kmToRestaurant(home, "Mamoudzou", { id: "kebab-house", commune: "Mamoudzou" })!;
    const jeje = kmToRestaurant(home, "Mamoudzou", { id: "jeje-kebab-mamoudzou", commune: "Mamoudzou" })!;
    assert.ok(kebab < jeje);
    assert.ok(kmToRestaurant(home, "Pamandzi", { id: "kebab-house", commune: "Mamoudzou" })! > kebab + 14);
  });
});

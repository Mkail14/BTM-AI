import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FOOD_CATALOG } from "@/lib/food/catalog";
import { kmToRestaurant, RESTAURANT_QUARTIERS, restaurantPlace } from "@/lib/food/places";
import { findVillage } from "@/lib/geo/villages";

describe("position des restaurants", () => {
  it("chaque quartier noté existe sur la carte et chaque restaurant noté existe", () => {
    for (const [id, quartier] of Object.entries(RESTAURANT_QUARTIERS)) {
      assert.ok(FOOD_CATALOG.some((r) => r.id === id), `restaurant inconnu : ${id}`);
      assert.ok(findVillage(quartier), `quartier inconnu : ${quartier}`);
    }
  });

  it("le quartier connu donne une position exacte, sinon le centre de la commune", () => {
    RESTAURANT_QUARTIERS["essai-kaweni"] = "Kawéni";
    try {
      const kaweni = restaurantPlace({ id: "essai-kaweni", commune: "Mamoudzou" });
      assert.equal(kaweni?.exact, true);
      assert.equal(kaweni?.label, "Kawéni");
      assert.equal(restaurantPlace({ id: "inconnu", commune: "Mamoudzou" })?.exact, false);
      // Depuis M'Tsapéré, Kawéni est à moins de 3 km ; la barge ajoute 15 km depuis Petite-Terre.
      const home = findVillage("M'Tsapéré")!.point;
      const near = kmToRestaurant(home, "Mamoudzou", { id: "essai-kaweni", commune: "Mamoudzou" })!;
      assert.ok(near < 3);
      assert.ok(kmToRestaurant(home, "Pamandzi", { id: "essai-kaweni", commune: "Mamoudzou" })! > near + 14);
    } finally {
      delete RESTAURANT_QUARTIERS["essai-kaweni"];
    }
  });
});

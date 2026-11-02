import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deliveryPoint, positionAt, restaurantPoint, routeKm, routePath } from "@/lib/food/route";
import { distanceKm } from "@/lib/geo/communes";

describe("trajet du livreur (carte du suivi)", () => {
  const from = restaurantPoint("jeje-kebab", "Mamoudzou");

  it("place toujours le restaurant au même endroit", () => {
    assert.deepEqual(restaurantPoint("jeje-kebab", "Mamoudzou"), from);
  });

  it("ne colle jamais la livraison au restaurant", () => {
    const to = deliveryPoint("BTM-7K3Q", "Mamoudzou", null, from);
    assert.ok(distanceKm(from, to) >= 0.8);
    const sameSpot = deliveryPoint("BTM-7K3Q", "Mamoudzou", { lat: from.lat, lng: from.lng }, from);
    assert.ok(distanceKm(from, sameSpot) >= 0.8);
  });

  it("garde la position GPS donnée quand elle est assez loin", () => {
    const geo = { lat: -12.7336, lng: 45.2042 };
    assert.deepEqual(deliveryPoint("BTM-7K3Q", "Koungou", geo, from), geo);
  });

  it("fait avancer le livreur du restaurant à la livraison", () => {
    const to = deliveryPoint("BTM-7K3Q", "Koungou", null, from);
    const path = routePath(from, to, "BTM-7K3Q");
    assert.ok(distanceKm(positionAt(path, 0), from) < 0.01);
    assert.ok(distanceKm(positionAt(path, 1), to) < 0.01);
    const half = positionAt(path, 0.5);
    const total = routeKm(path);
    assert.ok(Math.abs(distanceKm(from, half) - distanceKm(half, to)) < total * 0.3);
  });
});

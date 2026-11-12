import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findLandmark, landmarkChoices } from "@/lib/geo/landmarks";
import { detectTrip } from "@/lib/trip/intent";

describe("plages connues", () => {
  it("« de chez moi jusqu'à Moya » : départ de la maison, Moya demande Grande ou Petite", () => {
    const trip = detectTrip("itinéraire de chez moi jusqu'à Moya");
    assert.deepEqual(trip, { to: "moya", from: null });
    assert.deepEqual(landmarkChoices(trip!.to), ["Grande Moya", "Petite Moya"]);
    assert.deepEqual(landmarkChoices("plage de Moya"), ["Grande Moya", "Petite Moya"]);
  });

  it("les noms qu'on dit vraiment", () => {
    assert.equal(findLandmark("grande moya")?.name, "Grande Moya");
    assert.equal(findLandmark("la petite Moya")?.name, "Petite Moya");
    assert.equal(findLandmark("petit moya")?.name, "Petite Moya");
    assert.equal(findLandmark("plage de la grande moya")?.name, "Grande Moya");
    assert.equal(findLandmark("ngouja")?.name, "Plage de N'Gouja");
    assert.equal(findLandmark("Sakouli")?.name, "Plage de Sakouli");
    assert.equal(landmarkChoices("grande moya"), null);
  });
});

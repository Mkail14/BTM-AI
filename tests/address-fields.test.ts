import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import * as fields from "@/lib/address-fields";
import { addressSchema, geolocationErrorMessage, isInMayotte, MAX_GPS_ACCURACY_M } from "@/lib/address";
import { MAYOTTE_COMMUNES } from "@/lib/code-exam/candidate";

describe("champs d'adresse sans zod (navigateur)", () => {
  it("les anciens fichiers réexportent les mêmes valeurs", () => {
    assert.equal(MAYOTTE_COMMUNES, fields.MAYOTTE_COMMUNES);
    assert.equal(MAYOTTE_COMMUNES.length, 17);
    assert.equal(isInMayotte, fields.isInMayotte);
    assert.equal(geolocationErrorMessage, fields.geolocationErrorMessage);
    assert.equal(MAX_GPS_ACCURACY_M, 500);
  });

  it("la commune reste vérifiée par le schéma du serveur", () => {
    assert.equal(addressSchema.safeParse({ commune: "Sada", line: "Rue de la mosquée", geo: null }).success, true);
    assert.equal(addressSchema.safeParse({ commune: "Paris", line: "Rue de la mosquée", geo: null }).success, false);
  });

  it("le fichier ne charge pas zod", () => {
    assert.doesNotMatch(readFileSync("src/lib/address-fields.ts", "utf8"), /from "zod"/);
  });
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { addressFieldErrors, addressSchema, isInMayotte } from "@/lib/address";
import { DISPOSABLE_EMAIL_DOMAINS, isDisposableEmail } from "@/lib/auth/disposable-email";
import { fieldError, maskPhone, normalizePhone } from "@/lib/code-exam/candidate";

describe("téléphone", () => {
  it("refuse les numéros inventés, surtaxés ou étrangers", () => {
    assert.equal(normalizePhone("06 12 34 56 78"), null);
    assert.equal(normalizePhone("0600000000"), null);
    assert.equal(normalizePhone("0899 12 34 56"), null);
    // +269 : les Comores, pas Mayotte.
    assert.equal(normalizePhone("+269 639 12 34 56"), null);
    assert.equal(normalizePhone("+262 269 61 23 45"), "0269612345");
  });

  it("ne montre jamais le numéro entier", () => {
    assert.equal(maskPhone("0639481573"), "06 •• •• •• 73");
  });
});

describe("e-mails jetables", () => {
  it("les reconnaît, sous-domaines compris, sans gêner les vraies adresses", () => {
    assert.equal(isDisposableEmail("ali@YopMail.com"), true);
    assert.equal(isDisposableEmail("ali@x.mailinator.com"), true);
    assert.equal(isDisposableEmail("ali@gmail.com"), false);
    assert.equal(isDisposableEmail("ali@orange.fr"), false);
    assert.match(fieldError("email", "ali@yopmail.fr") ?? "", /temporaires/);
  });

  it("la base bloque exactement la même liste", () => {
    const sql = readFileSync("supabase/migrations/20261112000000_address_contact_security.sql", "utf8");
    const inSql = new Set([...sql.matchAll(/^\s+\('([^']+)'\)/gm)].map((m) => m[1]));
    assert.deepEqual([...inSql].sort(), [...DISPOSABLE_EMAIL_DOMAINS].sort());
  });
});

describe("adresse", () => {
  it("demande une commune de Mayotte et une adresse utilisable", () => {
    assert.deepEqual(addressFieldErrors({ commune: "", line: "ici" }), {
      commune: "Choisis ta commune.",
      line: "Indique ton adresse : rue, quartier, repère (près de la mosquée…).",
    });
    assert.deepEqual(addressFieldErrors({ commune: "Koungou", line: "Rue du stade, Majicavo" }), { commune: null, line: null });
  });

  it("n'accepte qu'une position GPS à Mayotte et assez précise", () => {
    assert.equal(isInMayotte(-12.78, 45.23), true);
    assert.equal(isInMayotte(-20.88, 55.45), false); // La Réunion
    const base = { commune: "Mamoudzou", line: "Rue de la mairie" };
    assert.equal(addressSchema.safeParse({ ...base, geo: { lat: -12.78, lng: 45.23, accuracy: 20 } }).success, true);
    assert.equal(addressSchema.safeParse({ ...base, geo: { lat: -12.78, lng: 45.23, accuracy: 3000 } }).success, false);
    assert.equal(addressSchema.safeParse({ ...base, geo: { lat: 48.85, lng: 2.35, accuracy: 10 } }).success, false);
  });
});

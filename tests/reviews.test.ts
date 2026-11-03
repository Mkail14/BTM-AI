import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publicName, REVIEW_COMMENT_MAX, reviewSchema } from "@/lib/reviews/rules";

describe("publicName", () => {
  it("garde le prénom et l'initiale du nom", () => {
    assert.equal(publicName("Fatima Mohamed Ali"), "Fatima A.");
    assert.equal(publicName("  mario   rabe "), "Mario R.");
  });

  it("garde un prénom seul tel quel", () => {
    assert.equal(publicName("Inaya"), "Inaya");
  });

  it("ne révèle rien sans nom (jamais l'e-mail)", () => {
    assert.equal(publicName(null), "Membre de BTM IA");
    assert.equal(publicName("   "), "Membre de BTM IA");
  });
});

describe("reviewSchema", () => {
  const valid = { rating: 5, comment: "Tamilya m'aide à apprendre le shimaoré.", commune: "Sada" as const };

  it("accepte un avis complet ou sans texte ni commune", () => {
    assert.ok(reviewSchema.safeParse(valid).success);
    assert.ok(reviewSchema.safeParse({ rating: 3, comment: "", commune: null }).success);
  });

  it("refuse une note hors de 1 à 5 ou non entière", () => {
    for (const rating of [0, 6, 4.5]) assert.equal(reviewSchema.safeParse({ ...valid, rating }).success, false);
  });

  it("refuse un texte trop long", () => {
    assert.equal(reviewSchema.safeParse({ ...valid, comment: "a".repeat(REVIEW_COMMENT_MAX + 1) }).success, false);
  });

  it("refuse les liens (publicité, arnaques)", () => {
    for (const comment of ["Voir https://exemple.com", "allez sur www.promo.fr", "super site arnaque.com"]) {
      assert.equal(reviewSchema.safeParse({ ...valid, comment }).success, false, comment);
    }
  });

  it("refuse une commune qui n'est pas à Mayotte et les champs en trop", () => {
    assert.equal(reviewSchema.safeParse({ ...valid, commune: "Paris" }).success, false);
    assert.equal(reviewSchema.safeParse({ ...valid, name: "Faux nom" }).success, false);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPasswordValid,
  normalizeDisplayName,
  passwordChecks,
  suggestEmailCorrection,
} from "@/lib/auth/signup";

describe("passwordChecks", () => {
  it("exige longueur, lettre et chiffre", () => {
    assert.equal(isPasswordValid("abcdefgh"), false);
    assert.equal(isPasswordValid("12345678"), false);
    assert.equal(isPasswordValid("abc123"), false);
    assert.equal(isPasswordValid("mayotte976"), true);
  });

  it("accepte les lettres accentuées", () => {
    assert.ok(passwordChecks("éèàùç1234").find((c) => c.id === "letter")?.ok);
  });

  it("refuse un mot de passe qui reprend l'adresse e-mail", () => {
    assert.equal(isPasswordValid("Fatima2026", "fatima@gmail.com"), false);
    assert.equal(isPasswordValid("lagon2026!", "fatima@gmail.com"), true);
  });
});

describe("suggestEmailCorrection", () => {
  it("corrige les fautes courantes sur les grands fournisseurs", () => {
    assert.equal(suggestEmailCorrection("Ali@Gmial.com "), "ali@gmail.com");
    assert.equal(suggestEmailCorrection("ali@hotmail.fe"), "ali@hotmail.fr");
    assert.equal(suggestEmailCorrection("ali@orange.ft"), "ali@orange.fr");
  });

  it("ne propose rien pour une adresse correcte ou un domaine d'entreprise", () => {
    assert.equal(suggestEmailCorrection("ali@gmail.com"), null);
    assert.equal(suggestEmailCorrection("contact@bt.fr"), null);
    assert.equal(suggestEmailCorrection("contact@groupe-btm.yt"), null);
    assert.equal(suggestEmailCorrection("pas-une-adresse"), null);
  });
});

describe("normalizeDisplayName", () => {
  it("nettoie les espaces et limite la longueur", () => {
    assert.equal(normalizeDisplayName("  Anli   Saïd "), "Anli Saïd");
    assert.equal(normalizeDisplayName("a".repeat(100)).length, 60);
  });
});

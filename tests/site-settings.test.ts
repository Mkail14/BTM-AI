import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasAdminRole, hasPrincipalAdminRole } from "@/lib/auth/roles";
import { formatIban, isValidBic, isValidIban, parseRib } from "@/lib/site/iban";
import { siteClosure } from "@/lib/site/status";

describe("États du site", () => {
  it("ferme le site au public en maintenance et en attente d'un partenaire, pas en ligne", () => {
    assert.equal(siteClosure("online"), null);
    assert.match(siteClosure("maintenance")?.apiError ?? "", /maintenance/);
    assert.match(siteClosure("waiting_partner")?.apiError ?? "", /bientôt/);
  });
});

describe("Profil de l'entreprise", () => {
  it("vérifie la clé d'un IBAN, espaces et minuscules compris", () => {
    assert.equal(isValidIban("FR76 3000 6000 0112 3456 7890 189"), true);
    assert.equal(isValidIban("fr7630006000011234567890189"), true);
    assert.equal(isValidIban("FR76 3000 6000 0112 3456 7890 188"), false);
    assert.equal(isValidIban("FR76"), false);
    assert.equal(formatIban("fr7630006000011234567890189"), "FR76 3000 6000 0112 3456 7890 189");
  });

  it("accepte un BIC de 8 ou 11 caractères", () => {
    assert.equal(isValidBic("BNPAFRPP"), true);
    assert.equal(isValidBic("bnpa frpp xxx"), true);
    assert.equal(isValidBic("BNPA"), false);
  });

  it("distingue l'administrateur principal du délégué", () => {
    const principal = { app_metadata: { role: "admin" } };
    const secondary = { app_metadata: { role: "admin", admin_level: "secondary" } };
    assert.equal(hasPrincipalAdminRole(principal), true);
    assert.equal(hasAdminRole(secondary), true);
    assert.equal(hasPrincipalAdminRole(secondary), false);
    assert.equal(hasPrincipalAdminRole({ app_metadata: { role: null } }), false);
    // Le rôle ne se lit jamais dans user_metadata, modifiable par la personne elle-même.
    assert.equal(hasPrincipalAdminRole({ user_metadata: { role: "admin" } }), false);
  });

  it("reconnaît un RIB collé : IBAN, BIC, titulaire et banque", () => {
    const rib = parseRib(
      [
        "RELEVÉ D'IDENTITÉ BANCAIRE",
        "Titulaire du compte : GROUPE BTM",
        "Domiciliation : CIC MAMOUDZOU",
        "Banque Guichet N° compte Clé",
        "30006 00001 12345678901 89",
        "IBAN : FR76 3000 6000 0112 3456 7890 189",
        "BIC : AGRIFRPP882",
      ].join("\n"),
    );
    assert.deepEqual(rib, {
      iban: "FR7630006000011234567890189",
      bic: "AGRIFRPP882",
      holder: "GROUPE BTM",
      bankName: "CIC MAMOUDZOU",
    });
  });

  it("déduit la banque et le BIC du code banque quand le RIB ne les donne pas", () => {
    const rib = parseRib("FR76 3000 4000 0312 3456 7890 046");
    assert.equal(rib.bankName, "BNP Paribas");
    assert.equal(rib.bic, "BNPAFRPPXXX");
  });

  it("ignore un texte sans IBAN valide", () => {
    assert.equal(parseRib("Bonjour, voici mon numéro 0639 12 34 56").iban, undefined);
  });

  it("lit un RIB où les valeurs sont sous les étiquettes, avec un BIC de La Réunion", () => {
    const rib = parseRib(
      [
        "Relevé d'identité bancaire",
        "Titulaire du compte",
        "GROUPE BTM",
        "IBAN (International Bank Account Number)",
        "FR76 3000 6000 0112 3456 7890 189",
        "BIC (Bank Identifier Code)",
        "AGRIRERX",
      ].join("\n"),
    );
    assert.equal(rib.holder, "GROUPE BTM");
    assert.equal(rib.bic, "AGRIRERX");
    assert.equal(rib.bankName, "Crédit Agricole");
  });

  it("trouve le BIC sans étiquette, sur la même ligne que l'IBAN", () => {
    const rib = parseRib("IBAN FR76 3000 6000 0112 3456 7890 189 BIC BFCORERX");
    assert.equal(rib.bic, "BFCORERX");
    assert.equal(rib.bankName, "BFC Océan Indien");
  });
});

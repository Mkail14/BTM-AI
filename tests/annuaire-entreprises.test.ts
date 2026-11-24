import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { directoryBlock, matchDirectory } from "../src/server/services/entreprises/listings";
import { companyAsk } from "../src/server/services/live/companies";
import { BLANK_LISTING, formValuesOf, listingAdminSchema, listingEditSchema, listingForTamilya, listingSource, type Listing } from "../src/lib/entreprises/listing";

const fiche = (over: Partial<Listing>): Listing => ({
  ...BLANK_LISTING,
  id: crypto.randomUUID(),
  siret: null,
  published: true,
  verifiedOn: null,
  ownerId: null,
  ownerUpdatedAt: null,
  updatedAt: "2026-11-25T00:00:00Z",
  ...over,
});

const somaco = fiche({ name: "Somaco", aliases: ["Somaco Kawéni"], category: "matériaux et quincaillerie", commune: "97611", phones: ["0269610000"], siret: "12345678900011", verifiedOn: "2026-03-10" });
const plombier = fiche({ name: "Sada Plomberie Services", category: "plomberie", commune: "97616", phones: ["0639000000"] });
const autrePlombier = fiche({ name: "Plomberie du Nord", category: "plomberie", commune: "97601" });
const ferme = fiche({ name: "Ancienne Plomberie", category: "plomberie", commune: "97616", status: "ferme_definitif" });
const all = [somaco, plombier, autrePlombier, ferme];

const match = (message: string) => matchDirectory(all, message, companyAsk(message));

describe("annuaire Tamilya des entreprises", () => {
  it("trouve une fiche par son nom, même sans le mot « entreprise »", () => {
    assert.deepEqual(match("C'est quoi le numéro de Somaco ?").asked, [somaco]);
    assert.deepEqual(match("somaco kaweni ouvre à quelle heure").asked, [somaco]);
    assert.deepEqual(match("le siret 12345678900011").asked, [somaco]);
  });

  it("propose les fiches d'un métier dans une commune, sans les fermées", () => {
    const found = match("Tu connais un plombier à Sada ?");
    assert.deepEqual(found.asked, []);
    assert.deepEqual(found.listed, [plombier]);
    assert.deepEqual(match("le numéro d'un plombier").listed, [plombier, autrePlombier]);
  });

  it("ne répond pas aux messages qui n'en parlent pas", () => {
    assert.deepEqual(match("Comment on dit merci ?"), { asked: [], listed: [] });
    assert.deepEqual(match("Quel temps fait-il à Sada ?"), { asked: [], listed: [] });
    assert.equal(directoryBlock({ asked: [], listed: [] }), null);
  });

  it("donne la fiche à Tamilya avec sa source", () => {
    const text = listingForTamilya(somaco);
    assert.match(text, /Téléphone : 0269610000/);
    assert.match(text, /Adresse : Mamoudzou/);
    assert.match(text, /Source : vérifié par l'équipe Tamilya en mars 2026\./);
    assert.match(listingForTamilya(ferme), /ATTENTION : fermé pour toujours/);
    assert.match(directoryBlock({ asked: [somaco], listed: [] }) ?? "", /ne le devine jamais/);
  });

  it("dit que l'info vient de l'entreprise quand elle a changé sa fiche après l'équipe", () => {
    assert.match(listingSource({ verifiedOn: "2026-03-10", ownerUpdatedAt: "2026-04-12T08:00:00Z" }), /données par l'entreprise elle-même le 12 avril 2026/);
    assert.match(listingSource({ verifiedOn: "2026-05-01", ownerUpdatedAt: "2026-04-12T08:00:00Z" }), /vérifié par l'équipe Tamilya en mai 2026/);
    assert.equal(listingSource({ verifiedOn: null, ownerUpdatedAt: null }), "pas encore vérifié");
  });

  it("vérifie la fiche saisie", () => {
    const ok = listingEditSchema.parse({ ...formValuesOf(somaco, false), phones: ["02 69 61 00 00"], website: "somaco.yt", hours: { lun: "7h-17h", mar: "" } });
    assert.deepEqual(ok.phones, ["0269610000"]);
    assert.equal(ok.website, "https://somaco.yt");
    assert.deepEqual(ok.hours, { lun: "7h-17h" });
    assert.equal(listingEditSchema.safeParse({ ...BLANK_LISTING, name: "S" }).success, false);
    assert.equal(listingEditSchema.safeParse({ ...BLANK_LISTING, name: "Somaco", phones: ["abc"] }).success, false);
    assert.equal(listingAdminSchema.safeParse({ ...BLANK_LISTING, name: "Somaco", siret: "123" }).success, false);
    // L'entreprise ne peut pas changer son SIRET ni se publier : ces champs sont ignorés.
    const owner = listingEditSchema.parse({ ...BLANK_LISTING, name: "Somaco", siret: "99999999999999", published: true });
    assert.equal("siret" in owner, false);
    assert.equal("published" in owner, false);
  });
});

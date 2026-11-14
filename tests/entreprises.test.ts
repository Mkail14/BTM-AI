import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { activityOf, companyAsk, companyAskFromVoice, companyLine, namesMatch, toCompany } from "@/lib/live/companies";

describe("entreprises de Mayotte", () => {
  it("comprend le nom cherché", () => {
    assert.deepEqual(companyAsk("La société Sodifram existe encore ?"), { name: "sodifram", communes: [], trade: null, closed: false, strict: false });
    assert.equal(companyAsk("C’est quoi le siret de BTM IA ?")?.name, "btm ia");
    assert.equal(companyAsk("Qui est le gérant de Colas à Mayotte ?")?.name, "colas");
    assert.equal(companyAsk("le siren 099 382 913 c'est qui ?")?.name, "099382913");
  });

  it("comprend une liste par métier, commune ou entreprises fermées", () => {
    const ask = companyAsk("Quelles sont les entreprises de plomberie à Sada ?");
    assert.deepEqual([ask?.name, ask?.communes, ask?.trade?.codes], ["", ["97616"], ["43.22A"]]);
    assert.equal(companyAsk("Tu connais un électricien à Combani ?")?.trade?.label, "électricité");
    assert.equal(companyAsk("Liste des entreprises fermées à Koungou")?.closed, true);
  });

  it("sans le mot « entreprise », ne garde que les noms exacts", () => {
    assert.deepEqual(companyAsk("Tu connais Somaco ?"), { name: "somaco", communes: [], trade: null, closed: false, strict: true });
    assert.equal(companyAsk("Jeje Livraison existe encore ?")?.name, "jeje livraison");
    assert.equal(companyAsk("Le magasin Somaco de Kawéni")?.strict, true);
  });

  it("laisse passer les messages qui ne parlent pas d'entreprise", () => {
    assert.equal(companyAsk("Comment on dit merci ?"), null);
    assert.equal(companyAsk("Je vais au magasin"), null);
    assert.equal(companyAsk("J'ai mangé au restaurant hier"), null);
    assert.equal(companyAsk("Quel temps fait-il à Sada ?"), null);
  });

  it("au vocal, prend le nom, le métier et la commune donnés par Tamilya", () => {
    const ask = companyAskFromVoice({ name: "", trade: "Restaurant", commune: "Petite-Terre", closed: true });
    assert.deepEqual([ask.name, ask.communes, ask.trade?.label, ask.closed], ["", ["97608", "97615"], "restauration", true]);
    assert.equal(companyAskFromVoice({ name: "099 382 913", trade: "", commune: "", closed: false }).name, "099382913");
  });

  it("met une fiche de l'annuaire en clair", () => {
    const company = toCompany({
      siren: "099382913",
      nom_complet: "SOCIETE DE DISTRIBUTION FRANCO MAHORAISE SAS (SODIFRAM)",
      sigle: "SODIFRAM",
      activite_principale: "47.11D",
      date_creation: "1987-07-01",
      etat_administratif: "A",
      nombre_etablissements: 36,
      nombre_etablissements_ouverts: 33,
      siege: { adresse: "ZI KAWENI 97600 MAMOUDZOU", departement: "976", liste_enseignes: ["SHOPI"] },
      dirigeants: [
        { nom: "DUPONT", prenoms: "MARIE ANNE", qualite: "Président de SAS" },
        { denomination: "REVOGEX", qualite: "Commissaire aux comptes titulaire" },
      ],
    })!;
    assert.deepEqual(company.aliases, ["SHOPI"]);
    assert.deepEqual(company.leaders, ["MARIE DUPONT (président de sas)"]);
    assert.equal(namesMatch(company, "sodifram"), true);
    assert.equal(namesMatch(company, "sodifram plomberie"), false);
    assert.equal(
      companyLine(company),
      "- SOCIETE DE DISTRIBUTION FRANCO MAHORAISE SAS (SODIFRAM) (aussi : SHOPI) : commerce de détail ; ZI KAWENI 97600 MAMOUDZOU ; créée le 1 juillet 1987 ; en activité ; 36 établissements, dont 33 ouverts ; dirigée par MARIE DUPONT (président de sas) ; SIREN 099382913 ; fiche : https://annuaire-entreprises.data.gouv.fr/entreprise/099382913",
    );
  });

  it("dit qu'une entreprise est fermée, et où est son établissement de Mayotte", () => {
    const company = toCompany({
      siren: "111222333",
      nom_complet: "EXEMPLE BTP",
      activite_principale: "43.22A",
      date_creation: "2008-04-01",
      date_fermeture: "2024-12-31",
      etat_administratif: "C",
      siege: { adresse: "97430 LE TAMPON", departement: "974", libelle_commune: "LE TAMPON" },
      matching_etablissements: [{ adresse: "PASSAMAINTY 97600 MAMOUDZOU", departement: "976" }],
    })!;
    assert.match(companyLine(company), /plomberie \(travaux du bâtiment\) ; PASSAMAINTY 97600 MAMOUDZOU ; siège hors de Mayotte \(LE TAMPON\) ; créée le 1 avril 2008 ; fermée le 31 décembre 2024 ;/);
    assert.equal(toCompany({ nom_complet: "Sans numéro" }), null);
    assert.equal(activityOf("99.99Z"), null);
  });
});

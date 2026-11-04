import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { btmDevisSpec, detectBtmDevis, mesuresDans, parseBtmDevisSpec } from "@/lib/btm/intent";
import { calculerDevis, lienCalculateur, nomDevis, validerValeurs, OUVRAGES } from "@/lib/btm/ouvrages";

describe("Devis BTM : demande reconnue", () => {
  it("ouvre le devis pour une demande de nouveau devis", () => {
    assert.equal(detectBtmDevis("Je voudrais un devis BTM"), "choix");
    assert.equal(detectBtmDevis("fais-moi un devis pour une dalle"), "dalle");
    assert.equal(detectBtmDevis("combien coûte un mur de 10 m sur 2,5 ?"), "mur");
    assert.equal(detectBtmDevis("prix du carrelage pour ma cuisine"), "carrelage");
  });

  it("n'ouvre rien pour une question sur un devis existant ou hors bâtiment", () => {
    assert.equal(detectBtmDevis("mon code de retrait ne marche pas"), null);
    assert.equal(detectBtmDevis("j'ai perdu mon devis de dalle"), null);
    assert.equal(detectBtmDevis("je voudrais un devis d'assurance auto"), null);
    assert.equal(detectBtmDevis("le mur de mon voisin est beau"), null);
  });

  it("lit les mesures dans la phrase", () => {
    assert.deepEqual(mesuresDans("dalle", "une dalle de 8 m sur 6 m, 12 cm"), { longueur: 8, largeur: 6, epaisseur: 12 });
    // Épaisseur donnée en mètres sans le dire : 0,12 → 12 cm.
    assert.deepEqual(mesuresDans("dalle", "dalle 8 sur 6 sur 0,12"), { longueur: 8, largeur: 6, epaisseur: 12 });
    assert.deepEqual(mesuresDans("mur", "un mur de 10 m sur 2,5"), { longueur: 10, hauteur: 2.5 });
    assert.equal(btmDevisSpec("devis pour une dalle de 8 m sur 6"), "dalle longueur=8 largeur=6");
  });

  it("relit le bloc et ignore les valeurs hors limites", () => {
    assert.deepEqual(parseBtmDevisSpec("dalle longueur=8 largeur=6.5 epaisseur=900"), { type: "dalle", valeurs: { longueur: "8", largeur: "6,5" } });
    assert.deepEqual(parseBtmDevisSpec("choix"), { type: null, valeurs: {} });
  });
});

describe("Devis BTM : mêmes calculs que btm.yt", () => {
  it("dalle 8 × 6 × 12 cm", () => {
    const r = calculerDevis("dalle", { longueur: "8", largeur: "6", epaisseur: "12" });
    assert.ok(r);
    assert.deepEqual(
      r.lignes.map((l) => [l.id, l.quantite, l.sousTotal]),
      [
        ["beton", 13.82, 2003.9],
        ["ferraillage", 240, 528],
        ["gravier", 4.61, 391.85],
      ],
    );
    assert.equal(r.total, 2923.75);
    assert.equal(nomDevis(r), "Dalle 8 m × 6 m × 12 cm (Tamilya)");
  });

  it("mur 10 × 2,5 m sans ouverture", () => {
    const r = calculerDevis("mur", { longueur: "10", hauteur: "2,5" });
    assert.ok(r);
    assert.deepEqual(r.lignes.map((l) => [l.id, l.quantite]), [["parpaing", 329], ["ciment", 10], ["sable", 2.5]]);
    assert.equal(r.total, 987.6);
    assert.equal(r.dimensions.ouvertures, 0);
  });

  it("prend les prix et constantes de btm.yt quand ils arrivent", () => {
    const base = calculerDevis("fondation", { longueur: 30, largeur: 0.5, profondeur: 0.6 });
    const cher = calculerDevis(
      "fondation",
      { longueur: 30, largeur: 0.5, profondeur: 0.6 },
      { source: "btm", catalogue: { acier: { id: "acier", libelle: "Acier", unite: "kg", prixUnitaire: 3 } }, parametres: { fondation: { kgAcierParM3: 60, inconnu: 9 } } },
    );
    assert.ok(base && cher);
    assert.equal(cher.lignes.find((l) => l.id === "acier")?.quantite, 540);
    assert.equal(cher.lignes.find((l) => l.id === "acier")?.sousTotal, 1620);
    // Matériau absent de la réponse : prix de repli.
    assert.equal(cher.lignes[0].prixUnitaire, base.lignes[0].prixUnitaire);
  });

  it("refuse des mesures impossibles", () => {
    const mur = OUVRAGES.find((o) => o.id === "mur")!;
    assert.equal(validerValeurs(mur, { longueur: "2", hauteur: "2", ouvertures: "5" }).erreurs.ouvertures, "Plus grand que le mur");
    assert.equal(calculerDevis("dalle", { longueur: "8", largeur: "6", epaisseur: "2" }), null);
    assert.equal(calculerDevis("dalle", { longueur: "abc", largeur: "6", epaisseur: "12" }), null);
  });

  it("ouvre le calculateur de btm.yt déjà rempli", () => {
    assert.equal(lienCalculateur("dalle", { longueur: 8, largeur: 6, epaisseur: 12 }), "https://www.btm.yt/calculateur?type=dalle&longueur=8&largeur=6&epaisseur=12");
  });
});

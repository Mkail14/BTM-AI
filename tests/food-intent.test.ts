import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FOOD_CATALOG } from "@/lib/food/catalog";
import { detectFoodOrder } from "@/lib/food/intent";

const detect = (message: string, earlier: string[] = []) => detectFoodOrder(message, earlier, FOOD_CATALOG);

describe("demande de repas reconnue par le serveur", () => {
  it("ouvre le restaurant cité, même sans verbe", () => {
    assert.equal(detect("je veux juste un crousty palm"), "Crousty Palm");
    assert.equal(detect("crousty palm"), "Crousty Palm");
  });

  it("comprend « je veux commander ça » d'après le message précédent", () => {
    assert.equal(detect("je veux commander sa", ["je veux juste un crousty palm"]), "Crousty Palm");
    assert.equal(detect("ok je prends ça", ["une pizza stp"]), "pizza");
    assert.equal(detect("je veux ça", ["je veux une pizza"]), "pizza");
  });

  it("ouvre un plat seulement s'il y a l'envie", () => {
    assert.equal(detect("je veux un tacos"), "tacos");
    assert.equal(detect("j'aime bien la pizza"), null);
  });

  it("ouvre toute l'offre quand on a faim sans précision", () => {
    assert.equal(detect("coucou tamilya j'ai trop faim"), "tout");
    assert.equal(detect("je veux commander à manger"), "tout");
  });

  it("« l'île » seule ne désigne pas Le Goût des Îles", () => {
    assert.equal(detect("Comparez les fournisseurs de l'île, enregistrez votre devis."), null);
    assert.equal(detect("le goût des îles"), "LE GOÛT DES ÎLES");
  });

  it("ne confond pas avec d'autres demandes", () => {
    assert.equal(detect("je veux passer mon code"), null);
    assert.equal(detect("je veux passer le code", ["je veux une pizza"]), null);
    assert.equal(detect("comment refaire ma carte grise ?"), null);
    assert.equal(detect("tu me conseilles un livre ?"), null);
    assert.equal(detect("ma commande arrive quand ?"), null);
    assert.equal(detect("c'est quoi mon code de commande"), null);
  });
});

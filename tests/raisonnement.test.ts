import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isComplexRequest, needsWebSearch } from "@/lib/ai/depth";

describe("raisonnement adaptatif", () => {
  it("réponse rapide pour les messages simples", () => {
    for (const m of ["Coucou", "Merci !", "ça va ?", "Bonjour Tamilya", "Comment on dit merci ?"]) assert.equal(isComplexRequest(m), false, m);
  });

  it("réflexion approfondie pour les projets, comparaisons, calculs et conseils", () => {
    for (const m of [
      "Je veux ouvrir un snack à Mamoudzou, est-ce rentable ?",
      "Compare la voiture et la barge pour aller à Petite-Terre tous les jours",
      "Explique-moi les démarches pour créer mon entreprise",
      "C'est quoi ton avis sur mon idée de vendre des mabawa sur internet ?",
    ]) assert.equal(isComplexRequest(m), true, m);
  });

  it("recherche internet pour les faits, l'actualité et les chiffres, pas pour la conversation", () => {
    for (const m of ["Qui est le préfet de Mayotte ?", "C'était quand le cyclone Chido ?", "Combien d'habitants à Mayotte ?", "Les horaires de la barge aujourd'hui"])
      assert.equal(needsWebSearch(m), true, m);
    for (const m of ["Coucou ma belle", "Raconte-moi une blague", "Comment on dit merci en shimaoré"]) assert.equal(needsWebSearch(m), false, m);
  });
});

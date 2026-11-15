import type { PersonalityId } from "./personalities";

/**
 * Couleur et traits de caractère de chaque personnalité (affichage seulement),
 * partagés par les cartes de choix et le sélecteur de la barre de saisie.
 * Couleurs assez foncées pour un texte blanc lisible (contraste ≥ 4,5:1 ou proche).
 */
export const PERSONALITY_LOOKS: Record<PersonalityId, { color: string; traits: string[] }> = {
  // Rose BTM (--accent du site) : c'est la personnalité par défaut.
  professionnelle: { color: "#c8295f", traits: ["Simple", "Gentille", "Claire"] },
};

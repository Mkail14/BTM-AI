import type { PersonalityId } from "./personalities";

/**
 * Couleur et traits de caractère de chaque personnalité (affichage seulement),
 * partagés par les cartes de choix et le sélecteur de la barre de saisie.
 * Couleurs assez foncées pour un texte blanc lisible (contraste ≥ 4,5:1 ou proche).
 */
export const PERSONALITY_LOOKS: Record<PersonalityId, { color: string; traits: string[] }> = {
  mechante: { color: "#d4383d", traits: ["Sarcastique", "Franche", "Taquine"] },
  professionnelle: { color: "#4f46e5", traits: ["Polie", "Précise", "Efficace"] },
  cool: { color: "#0378a6", traits: ["Détendue", "Drôle", "Naturelle"] },
};

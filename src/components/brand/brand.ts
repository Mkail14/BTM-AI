/**
 * Éléments de marque de BTM AI, séparés des composants fonctionnels.
 * Logos détourés (fond transparent) dans /public/brand/ :
 *   btm-ai-encre.png / btm-ai-creme.png : variante BTM AI — dans le « b », les
 *     îles de Mayotte sont remplacées par des étincelles (signe de l'IA) et le
 *     « t » est redressé ;
 *   btm-b.png : le « b » seul de cette variante (icône, écran de lancement) ;
 *   groupe-btm-encre.png / groupe-btm-creme.png : logo d'origine du Groupe BTM.
 * Sur le site, la forme sert de masque et prend la couleur du texte (thème clair ou sombre).
 */
export const BRAND = {
  name: "BTM AI",
  wordmark: { primary: "BTM", secondary: "AI" },
  parent: "GROUPE BTM",
  tagline: "L'intelligence artificielle pour Mayotte",
  logo: {
    src: "/brand/btm-ai-encre.png",
    /** Largeur / hauteur du fichier détouré (1039 × 483). */
    ratio: 1039 / 483,
  },
  colors: { ink: "#111111", cream: "#F5EAD9" },
} as const;

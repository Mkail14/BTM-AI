/**
 * Éléments de marque de BTM AI, séparés des composants fonctionnels.
 * Le logo du Groupe BTM est détouré (fond transparent) dans /public/brand/ :
 *   groupe-btm-encre.png : encre #111111, pour les fonds clairs (e-mails) ;
 *   groupe-btm-creme.png : crème #F5EAD9, pour les fonds sombres.
 * Sur le site, la forme sert de masque et prend la couleur du texte (thème clair ou sombre).
 */
export const BRAND = {
  name: "BTM AI",
  wordmark: { primary: "BTM", secondary: "AI" },
  parent: "GROUPE BTM",
  tagline: "L'intelligence artificielle pour Mayotte",
  logo: {
    src: "/brand/groupe-btm-encre.png",
    /** Largeur / hauteur du fichier détouré (1039 × 483). */
    ratio: 1039 / 483,
  },
  colors: { ink: "#111111", cream: "#F5EAD9" },
} as const;

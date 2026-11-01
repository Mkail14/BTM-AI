const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Remplace, dans une réponse d'Awa (Markdown), un passage tel que l'utilisateur
 * l'a sélectionné à l'écran : la sélection ne contient ni les retours à la
 * ligne, ni le gras (**), ni les crochets des [[mots]] du texte d'origine.
 * Majuscules ignorées. Renvoie le texte inchangé si le passage n'y est pas.
 */
export function replacePassage(content: string, passage: string, replacement: string): string {
  const words = passage.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return content;
  const between = "[\\s*_\\[\\]]+";
  // Marques de mise en forme collées au passage (gras, [[mot]]) : remplacées avec lui.
  const pattern = new RegExp(`(?:\\[\\[|\\*\\*|__)?${words.map(escape).join(between)}(?:\\]\\]|\\*\\*|__)?`, "giu");
  return content.replace(pattern, () => replacement);
}

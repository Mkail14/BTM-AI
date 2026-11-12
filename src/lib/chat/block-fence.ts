/**
 * Tamilya colle parfois le bloc d'une carte au bout de sa phrase, sur une seule ligne :
 * « Ok, ticket barge. ```ticket-barge pieton 1 » puis « ``` » à la ligne. Le Markdown ne
 * reconnaît un bloc ``` qu'en début de ligne : on voyait le texte brut et une barre grise vide
 * à la place de la carte. On remet le bloc sur ses lignes : nom seul, contenu dessous, fin seule.
 * Seuls les blocs de cartes connus sont touchés, jamais un vrai bout de code.
 */
export function separateCardBlocks(text: string, names: readonly string[]): string {
  if (!text.includes("```")) return text;
  const list = names.map((n) => n.replace(/[-]/g, "\\-")).join("|");
  const opening = new RegExp(`([^\\n]?)[ \\t]*\`\`\`(${list})(?![\\w-])[ \\t]*([^\\n]*)`, "g");
  return text.replace(opening, (_match, before: string, name: string, rest: string) => {
    const lead = before ? `${before}\n\n` : "";
    // Fin collée au contenu (« pieton 1``` ») : remise sur sa propre ligne.
    const closed = /`{3,}\s*$/.test(rest);
    const content = rest.replace(/`{3,}\s*$/, "").trim();
    return `${lead}\`\`\`${name}${content ? `\n${content}` : ""}${closed ? "\n```" : ""}`;
  });
}

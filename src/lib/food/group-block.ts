/** Bloc ```commande-groupee``` : le panier composé par Tamilya, un article par ligne. */
export const GROUP_BLOCK = "commande-groupee";
export const groupBlock = (spec: string) => `\n\n\`\`\`${GROUP_BLOCK}\n${spec}\n\`\`\``;

/**
 * Petit message de politesse (bonjour, merci, ça va…) : rien à chercher sur internet.
 * La recherche Google n'est pas allumée pour eux : la réponse part tout de suite
 * (une clé sans facturation refuse la recherche, ce qui coûtait un aller-retour pour rien).
 * Vrai seulement si chaque mot du message est un mot de politesse.
 */
const POLITE_WORDS = new Set(
  [
    // Salutations
    "bonjour", "bonsoir", "salut", "coucou", "cc", "slt", "bjr", "bsr", "hello", "hey", "yo", "wesh", "re", "allo",
    // Shimaoré
    "kwezi", "jeje", "marahaba", "habari", "ndjema", "ndjeme",
    // Merci, accord
    "merci", "mrc", "mci", "beaucoup", "bcp", "ok", "okay", "oki", "dac", "daccord", "d", "accord", "super", "top", "cool",
        // Pas « oui » ni « non » : souvent la réponse à « tu veux que je cherche ? ».
    "genial", "parfait", "nickel", "trop", "bien", "tres", "ah", "oh", "ha", "haha", "mdr", "lol",
    // Ça va
    "ca", "va", "sa", "cv", "comment", "tu", "vas", "et", "toi", "vous", "allez", "moi", "aussi", "la", "forme", "quoi", "de", "neuf",
    // Au revoir
    "au", "revoir", "bye", "a", "plus", "bientot", "bonne", "nuit", "journee", "soiree", "tard", "demain",
    // À qui on parle
    "tamilya", "ma", "belle", "chef", "ami", "amie",
  ],
);

const MAX_WORDS = 8;

export function isSmallTalk(message: string): boolean {
  const words = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.length > 0 && words.length <= MAX_WORDS && words.every((word) => POLITE_WORDS.has(word));
}

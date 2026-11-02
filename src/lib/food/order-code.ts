import { randomInt } from "node:crypto";

/** Lettres et chiffres sans confusion possible à l'oral ou à l'écran (pas de 0/O, 1/I/L). */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Code de retrait d'une commande, à dicter ou montrer au livreur : « BTM-7K3Q ». */
export function orderCode(): string {
  let code = "";
  for (let i = 0; i < 4; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return `BTM-${code}`;
}

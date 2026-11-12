/**
 * La personne demande-t-elle un ticket de barge ? Lu par le serveur sur son
 * message : il faut parler de la barge ET d'un ticket (ou de l'acheter).
 * Une simple question (« la barge part à quelle heure ? ») n'ouvre rien.
 */

export const normalize = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")} `;

// « bargr », « barg », « barje » : fautes de frappe courantes sur téléphone.
const BARGE = /\b(?:barge|barges|bargr|barg|barje|amphidrome|traversee|petite terre|ptite terre|dzaoudzi|pamandzi)\b/;
const TICKET = /\b(?:ticket|tickets|tiket|tikets|billet|billets|acheter|achete|achat|payer|paye|reserver|reservation|commander|commande|commandes)\b/;
/** « je veux prendre la barge » : une envie de traverser, pas une question d'horaire. */
const TAKE = /\b(?:veux|voudrais|veut|vais|dois|faut) (?:\w+ )?prendre (?:la |une )?(?:barge|barges|bargr|barg|barje)\b/;
/** Question d'horaire ou de fonctionnement : jamais d'achat. */
const QUESTION = /\b(?:quelle heure|horaire|horaires|quand|combien de temps)\b/;

/** Questions sur un ticket déjà acheté : Tamilya répond, sans rouvrir l'achat. */
const ALREADY = /\b(?:mon ticket|mon billet|mes tickets|mes billets|deja achete|j ai achete|rembours\w*|annuler)\b/;

/** Départ de Petite-Terre : c'est gratuit, rien à acheter. */
const FROM_PETITE_TERRE = /\b(?:depuis|de|en partant de|partir de|quitter)\s+(?:la\s+)?(?:petite terre|ptite terre|dzaoudzi|pamandzi)\b/;

export type BargeIntent = "buy" | "free" | null;

export function detectBargeTicket(message: string): BargeIntent {
  const text = normalize(message);
  if (!BARGE.test(text) || ALREADY.test(text)) return null;
  if (!TICKET.test(text) && (!TAKE.test(text) || QUESTION.test(text))) return null;
  // « ticket pour aller de Petite-Terre à Mamoudzou » : le retour est gratuit.
  if (FROM_PETITE_TERRE.test(text) && !/\b(?:vers|pour|aller a|aller sur)\s+(?:la\s+)?(?:petite terre|ptite terre|dzaoudzi|pamandzi)\b/.test(text)) return "free";
  return "buy";
}

/** Bloc remplacé dans la conversation par l'achat de tickets (BargeTickets). */
export const BARGE_BLOCK = "ticket-barge";
export const bargeBlock = () => `\n\n\`\`\`${BARGE_BLOCK}\nmamoudzou-dzaoudzi\n\`\`\``;

/* -------------------------------------------------------------------------- */
/* Ce que la personne veut exactement                                         */
/* -------------------------------------------------------------------------- */

const NUMBERS: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10 };
const num = (word: string) => (/^\d+$/.test(word) ? Number(word) : NUMBERS[word]);
const COUNT = "(\\d+|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix)";

/** Véhicules reconnus, du plus précis au plus général. */
const VEHICLES: [RegExp, string][] = [
  [/\b(?:poids lourds?|semi|camion|camions|35 ?t)\b/, "pl-15"],
  [/\b(?:utilitaires?|camionnette|fourgon|fourgonnette|van|pick ?up)\b/, "utilitaire"],
  [/\b(?:grosse moto|moto|motos|125)\b/, "moto"],
  [/\b(?:scooter|scoot|cyclo|cyclomoteur|velo|velos|bicyclette|trottinette|mobylette)\b/, "velo"],
  [/\b(?:voiture|voitures|auto|bagnole|caisse|vehicule|4x4)\b/, "voiture"],
];

/**
 * Tickets demandés, d'après le message (ou le bloc écrit par Tamilya) : par défaut
 * un seul ticket piéton, « pour moi ». Un véhicule n'apparaît que s'il est
 * cité ; les personnes en plus seulement si elles sont dites (« pour 3 »,
 * « moi et ma femme », « avec 2 passagers »).
 */
export function parseBargeRequest(message: string): Record<string, number> {
  const text = normalize(message);
  const cart: Record<string, number> = {};

  const vehicle = VEHICLES.find(([pattern]) => pattern.test(text));
  if (vehicle) {
    const many = text.match(new RegExp(`\\b${COUNT}\\s+(?:voitures|motos|scooters|velos|camions|utilitaires|vehicules)\\b`));
    cart[vehicle[1]] = many ? Math.min(20, num(many[1]) ?? 1) : 1;
  }

  // Personnes : « 3 tickets », « pour 2 », « 2 personnes », « nous sommes 4 », « avec 2 passagers ».
  let people: number | null = null;
  const counted =
    text.match(new RegExp(`\\b${COUNT}\\s+(?:tickets?|billets?|personnes?|pietons?|adultes?|places?|passagers?)\\b`)) ??
    text.match(new RegExp(`\\b(?:pour|on est|nous sommes|on sera|nous serons)\\s+${COUNT}\\b(?!\\s*(?:euros?|h|heures?))`)) ??
    text.match(new RegExp(`\\bpieton\\s+${COUNT}\\b`));
  if (counted) people = num(counted[1]) ?? null;
  else if (/\bmoi et\b|\bavec (?:ma|mon|mes)\b/.test(text) && !vehicle) people = /\bmes\b/.test(text) ? 3 : 2;

  // Avec un véhicule, seuls les passagers dits en plus ont un ticket piéton.
  if (vehicle) {
    const passengers =
      text.match(new RegExp(`\\b${COUNT}\\s+(?:passagers?|pietons?|personnes?)\\b`)) ?? text.match(new RegExp(`\\bpieton\\s+${COUNT}\\b`));
    if (passengers) cart.pieton = Math.min(20, num(passengers[1]) ?? 1);
  } else {
    cart.pieton = Math.min(20, Math.max(1, people ?? 1));
  }
  return cart;
}

/** Tickets demandés, écrits pour le bloc : « pieton 2, voiture 1 ». */
export const bargeSpec = (message: string) =>
  Object.entries(parseBargeRequest(message))
    .map(([id, quantity]) => `${id} ${quantity}`)
    .join(", ");

/** Bloc écrit par le serveur, avec les tickets demandés. */
export const bargeBlockFor = (message: string) => {
  const spec = bargeSpec(message);
  return `\n\n\`\`\`${BARGE_BLOCK}\n${spec}\n\`\`\``;
};

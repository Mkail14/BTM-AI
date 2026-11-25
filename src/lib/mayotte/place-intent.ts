import { findTown, type Town } from "./towns";

/**
 * Lieu de Mayotte demandé dans le chat écrit (« c'est où Chiconi ? », « où se trouve Combani »,
 * « montre-moi Sada sur la carte ») : lu par le serveur sur le message. Le bloc ```carte-lieu```
 * ouvre une petite carte de l'île dans la conversation, posée sur le lieu (PlaceCard).
 * « Montre », « la carte » juste après : le lieu de son message d'avant.
 * Seuls les villes et villages connus du site sont montrés (findTown), jamais un lieu deviné.
 */

/** Bloc remplacé dans la conversation par la carte du lieu (PlaceCard). */
export const PLACE_BLOCK = "carte-lieu";

/** Contenu du bloc : le nom du lieu, tel que le site le connaît. */
export const placeBlock = (name: string) => `\n\n\`\`\`${PLACE_BLOCK}\n${name}\n\`\`\``;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const VERB = "(?:montre|montres|montrez|montrer|affiche|affiches|situe|situes|localise|localises|trouve|trouves)";
const ME = "(?: (?:moi|nous|le|la|les))*";

/** Questions de lieu ; le seul groupe capturé est le lieu. */
const ASKS = [
  // « c'est où Chiconi », « cest ou chiconi », « c ou chiconi »
  /^(?:mais |et |dis moi |stp |)(?:c est |cest |c |ca se trouve |ca est |)ou (?:se trouve |se situe |est situe |est situee |est |c est |cest |ca se trouve |il y a |)(.+)$/,
  // « Chiconi c'est où », « Chiconi se trouve où », « Chiconi est où »
  /^(.+?) (?:c est |cest |c |ca se trouve |se trouve |se situe |est situe |est situee |est |)ou(?: exactement| a mayotte| sur l ile| sur la carte)?$/,
  // « montre-moi Chiconi (sur la carte) », « situe Chiconi », « localise Sada »
  new RegExp(`^(?:tu peux |peux tu |tu peux me |peux tu me |)${VERB}${ME} (.+)$`),
  // « la carte de Chiconi », « le plan de Sada »
  /^(?:(?:je veux |je voudrais |)(?:voir |)(?:la |une |le |)(?:carte|plan) (?:de |d |du |))(.+)$/,
];

/** Ce qui entoure le nom sans en faire partie. */
const BEFORE = /^(?:(?:le |la |les |l )?(?:village|ville|commune|quartier|localite|bled|coin) (?:de |d |du )|a |au |en |)/;
const AFTER =
  / (?:sur (?:la |une |)(?:carte|plan)|sur l ile|a mayotte|exactement|stp|svp|s il te plait|s il vous plait|pour moi|precisement|dans l ile|sur mayotte)$/;

function cleanPlace(raw: string): string {
  let text = raw.trim();
  for (let i = 0; i < 3; i++) {
    const next = text.replace(AFTER, "").replace(BEFORE, "").trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

/** Le lieu nommé dans une question de lieu, ou null. */
function placeAsked(message: string): Town | null {
  const said = normalize(message);
  if (!said || said.split(" ").length > 10) return null;
  for (const ask of ASKS) {
    const x = ask.exec(said)?.[1];
    if (!x) continue;
    const town = findTown(cleanPlace(x));
    if (town) return town;
  }
  return null;
}

/** « Montre », « la carte », « montre-moi sur la carte » : relance sans lieu, qui vise le message d'avant. */
const SHOW_AGAIN =
  /^(?:(?:et |alors |ok |vas y |stp |)(?:montre|montres|montrez|affiche|ouvre|fais voir|je veux voir|tu peux montrer|tu peux me montrer|montre moi|montre nous|montre la|montre le)(?: moi| nous| la| le)?(?: (?:sur |)(?:la |une |)(?:carte|plan))?(?: stp| svp| s il te plait)?|(?:sur |)(?:la |une |)(?:carte|plan)(?: stp| svp| s il te plait)?|(?:et |)(?:la |une |)carte \?*)$/;

/**
 * Lieu de Mayotte à montrer pour ce message : nommé dedans, ou, si c'est une simple relance
 * (« montre », « la carte »), nommé dans l'un de ses deux messages d'avant (`previousAsks`, du plus récent au plus ancien).
 */
export function detectPlace(message: string, previousAsks: readonly string[] = []): Town | null {
  const asked = placeAsked(message);
  if (asked) return asked;
  if (!SHOW_AGAIN.test(normalize(message))) return null;
  for (const before of previousAsks.slice(0, 2)) {
    const town = placeAsked(before);
    if (town) return town;
  }
  return null;
}

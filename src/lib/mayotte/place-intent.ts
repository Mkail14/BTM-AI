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

// « mntre », « montr », « motre » : fautes de frappe courantes au téléphone.
const VERB = "(?:montre|montres|montrez|montrer|mntre|montr|motre|affiche|affiches|situe|situes|localise|localises|trouve|trouves)";
const ME = "(?: (?:moi|nous|le|la|les))*";
/** « carte », et « l acarte » (espace tapé une lettre trop tôt). */
const MAP = "(?:carte|acarte|plan)";

/** Questions de lieu ; le seul groupe capturé est le lieu. */
const ASKS = [
  // « c'est où Chiconi », « cest ou chiconi », « c ou chiconi »
  /^(?:mais |et |dis moi |stp |)(?:c est |cest |c |ca se trouve |ca est |)ou (?:se trouve |se situe |est situe |est situee |est |c est |cest |ca se trouve |il y a |)(.+)$/,
  // « Chiconi c'est où », « Chiconi se trouve où », « Chiconi est où »
  /^(.+?) (?:c est |cest |c |ca se trouve |se trouve |se situe |est situe |est situee |est |)ou(?: exactement| a mayotte| sur l ile| sur la carte)?$/,
  // « montre-moi Chiconi (sur la carte) », « situe Chiconi », « localise Sada »
  new RegExp(`^(?:tu peux |peux tu |tu peux me |peux tu me |)${VERB}${ME} (.+)$`),
  // « la carte de Chiconi », « le plan de Sada », « mntre la carte de Mayotte », « montre moi l acarte de Mayotte »
  new RegExp(`^(?:.{0,40}? )?(?:la |une |le |l |)${MAP} (?:de |d |du |)(.+)$`),
];

/** L'île entière : « Mayotte », « l'île », « Maore ». */
const ISLAND = /^(?:(?:l |)ile (?:de |)|)(?:mayotte|maore|l ile|ile|notre ile)$/;

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

/** Lieu à montrer : une ville ou un village (`town`), ou l'île entière (`town` null, nom « Mayotte »). */
export type Place = { name: string; town: Town | null };

/** Nom écrit dans le bloc pour l'île entière. */
export const ISLAND_NAME = "Mayotte";

/** « Oui », « ok », « bon » au début ne changent pas la question (« Oui c'est où Chiconi »). */
const FILLER = /^(?:(?:oui|ouais|ok|okay|bon|alors|d accord|dac|euh|ah|super|merci) )+/;

/** Le lieu nommé dans une question de lieu, ou null. */
function placeAsked(message: string): Place | null {
  const said = normalize(message).replace(FILLER, "");
  if (!said || said.split(" ").length > 10) return null;
  for (const ask of ASKS) {
    const x = ask.exec(said)?.[1];
    if (!x) continue;
    const cleaned = cleanPlace(x);
    if (ISLAND.test(cleaned)) return { name: ISLAND_NAME, town: null };
    const town = findTown(cleaned);
    if (town) return { name: town.name, town };
  }
  return null;
}

/** « Montre », « la carte », « montre-moi sur la carte » : relance sans lieu, qui vise le message d'avant. */
const SHOW_AGAIN =
  /^(?:(?:et |alors |ok |vas y |stp |)(?:montre|montres|montrez|mntre|affiche|ouvre|fais voir|je veux voir|tu peux montrer|tu peux me montrer|montre moi|montre nous|montre la|montre le)(?: moi| nous| la| le)?(?: (?:sur |)(?:la |une |)(?:carte|plan))?(?: stp| svp| s il te plait)?|(?:sur |)(?:la |une |)(?:carte|plan)(?: stp| svp| s il te plait)?|(?:et |)(?:la |une |)carte \?*)$/;

/**
 * Lieu de Mayotte à montrer pour ce message : nommé dedans, ou, si c'est une simple relance
 * (« montre », « la carte »), nommé dans l'un de ses deux messages d'avant (`previousAsks`, du plus récent au plus ancien).
 */
export function detectPlace(message: string, previousAsks: readonly string[] = []): Place | null {
  const asked = placeAsked(message);
  if (asked) return asked;
  // « Et Trévani ? » juste après « c'est où Chiconi ? » : même question, autre lieu.
  const other = /^(?:et|puis|aussi) (.+)$/.exec(normalize(message).replace(FILLER, ""))?.[1];
  if (other && other.split(" ").length <= 4 && previousAsks.length > 0 && placeAsked(previousAsks[0])) {
    const cleaned = cleanPlace(other);
    if (ISLAND.test(cleaned)) return { name: ISLAND_NAME, town: null };
    const town = findTown(cleaned);
    if (town) return { name: town.name, town };
  }
  if (!SHOW_AGAIN.test(normalize(message))) return null;
  for (const before of previousAsks.slice(0, 2)) {
    const place = placeAsked(before);
    if (place) return place;
  }
  return null;
}

/** Ce que Tamilya reçoit sur l'île entière : seulement des faits sûrs. */
export const ISLAND_FACTS =
  "La carte montre Mayotte en entier, Grande-Terre et Petite-Terre. Faits sûrs : Mayotte est un département français de l'océan Indien, dans l'archipel des Comores, entre Madagascar et la côte du Mozambique ; Mamoudzou, sur Grande-Terre, est sa plus grande ville ; Petite-Terre (Dzaoudzi, Pamandzi), où se trouve l'aéroport, est reliée à Grande-Terre par la barge. Aucun chiffre inventé.";

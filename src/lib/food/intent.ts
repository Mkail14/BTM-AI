import { DISH_KINDS, matchFoodQuery, normalizeFood } from "./match";

/**
 * La personne veut-elle commander à manger ? Lu par le serveur sur son
 * message, sans attendre le modèle : les petits modèles (et Awa en mode
 * maître, qui ne parle que shimaoré) oublient souvent d'ouvrir la commande.
 * Quand c'est oui, le serveur demande le bloc ```commande-repas``` et
 * l'ajoute lui-même si la réponse ne l'a pas.
 *
 * Renvoie ce qu'il faut mettre dans le bloc (restaurant et/ou plat, ou « tout »).
 */

type Restaurant = { id: string; name: string; kind: string };

/** Envie nette de manger ou de se faire livrer : suffit pour ouvrir la commande. */
const HUNGRY = /\b(?:command\w*|faim|manger|mange|bouffer|livr(?:aison|er|ez|e moi)|menu|quoi manger|a manger)\b/;

/** Envie plus vague (« je veux », « donne-moi ») : seulement avec un plat ou un restaurant. */
const WANTS = new RegExp(
  `${HUNGRY.source}|\\b(?:j ai envie|envie d|je veux|j veux|je voudrais|je prends?|donne moi|ramene moi|apporte moi|qu est ce qu (?:il|ils) (?:propose|font|ont|vend)\\w*)\\b`,
);

/** Questions sur une commande déjà passée : le suivi y répond, pas une nouvelle commande. */
const TRACKING = /\b(?:ma commande|ma livraison|mon livreur|le livreur|mon code|code de commande|arrive quand|elle arrive|il arrive|en cours|deja command\w*|j ai command\w*|annuler|rembours\w*)\b/;

/** Renvoi à ce qui vient d'être dit (« je veux commander ça », « celui-là »). */
const REFERS_BACK = /\b(?:ca|sa|ça|celui la|celle la|ceux la|le meme|la meme|pareil|chez eux|chez lui|la bas|ce resto|ce restaurant|ce plat)\b/;

function describe(match: { kind: string | null; restaurantId: string | null }, restaurants: readonly Restaurant[]): string | null {
  const restaurant = match.restaurantId ? restaurants.find((r) => r.id === match.restaurantId) : null;
  const kind = match.kind ? DISH_KINDS.find((k) => k.id === match.kind) : null;
  if (!restaurant && !kind) return null;
  return [kind?.id, restaurant?.name].filter(Boolean).join(" ");
}

/**
 * @param message      message de la personne
 * @param earlier      ses messages précédents, du plus récent au plus ancien (pour « je veux commander ça »)
 */
export function detectFoodOrder(message: string, earlier: readonly string[], restaurants: readonly Restaurant[]): string | null {
  const text = ` ${normalizeFood(message)} `;
  if (TRACKING.test(text)) return null;
  const wants = WANTS.test(text);
  const here = matchFoodQuery(message, restaurants);

  // Un restaurant cité suffit (« crousty palm », « c'est quoi le menu de Jéjé kebab ») ; un plat seul, il faut l'envie (« j'aime la pizza » n'est pas une commande).
  if (here.restaurantId || (here.kind && wants)) return describe(here, restaurants);
  const hungry = HUNGRY.test(text);
  // « Je veux ça » sans envie nette de manger : seulement s'il renvoie à un plat dont on vient de parler.
  if (!hungry && !(wants && REFERS_BACK.test(text))) return null;

  // « Je veux commander ça », « je veux commander » : ce dont on vient de parler (deux messages au plus).
  for (const previous of earlier.slice(0, 2)) {
    const before = matchFoodQuery(previous, restaurants);
    if (before.restaurantId || before.kind) return describe(before, restaurants);
  }
  // Envie de manger sans rien de précis : toute l'offre.
  return hungry ? "tout" : null;
}

/** Le bloc à ajouter à la réponse quand le modèle ne l'a pas écrit. */
export const foodBlock = (query: string) => `\n\n\`\`\`commande-repas\n${query}\n\`\`\``;

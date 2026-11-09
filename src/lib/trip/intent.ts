/**
 * Trajet demandé (« combien de temps de chez moi à la CSSM ? », « comment
 * aller à Sada depuis Mamoudzou ») : lu par le serveur sur le message. Le
 * bloc ```itineraire``` ouvre la carte du trajet dans la conversation.
 */

/** Bloc remplacé dans la conversation par la carte du trajet (TripCard). */
export const TRIP_BLOCK = "itineraire";

export type TripSpec = { to: string; from: string | null };

const normalize = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")} `;

/** Une demande de trajet, de temps ou de chemin. */
const ASKS =
  /\b(combien de temps|ca prend combien|c'?est loin|comment (?:aller|y aller|je vais|on va|me rendre|se rendre)|pour aller|aller (?:a|au|aux|jusqu|de|d'|depuis)|me rendre|se rendre|trajet|itineraire|chemin|en voiture|en taxi|en bus|a pied)\b/;
/** Questions sur une livraison ou une commande : le suivi y répond, pas un trajet. */
const NOT_A_TRIP = /\b(livraison|livreur|commande|colis|barge)\b/;
/** Départ « de chez moi » : l'adresse du compte. */
const HOME = /^(?:chez moi|moi|ma maison|maison|mon adresse|adresse|la maison|ici|mon domicile|domicile|chez nous|nous)$/;
/** Ce qui suit le lieu et n'en fait pas partie. */
const TAIL = /\s+(?:depuis|en voiture|en taxi|en bus|a pied|de chez|ca prend|combien|stp|s'?il te plait|svp|en ce moment|maintenant|demain|aujourd'?hui)\b.*$/;

/** « la cssm » → « cssm », « l'hopital » → « hopital ». */
const clean = (place: string) =>
  place
    .replace(TAIL, "")
    .replace(/[?.!,;:]+.*$/, "")
    .replace(/^(?:la|le|les|l'|un|une|chez)\s*/, "")
    .trim();

/** Le trajet demandé, ou null. `to` et `from` sont en minuscules sans accents (cherchés ensuite dans l'annuaire et sur la carte). */
export function detectTrip(message: string): TripSpec | null {
  let text = normalize(message);
  if (!ASKS.test(text) || NOT_A_TRIP.test(text)) return null;
  // « combien de temps (il faut) (pour aller) » : retiré, sinon « de temps » passerait pour un départ.
  text = text.replace(/\bcombien de temps(?: (?:ca prend|il faut|je mets|on met|faut-il))?\b/, " ");

  let to: string | null = null;
  let from: string | null = null;

  // « de X à Y », « depuis X jusqu'à Y »
  const both = /\b(?:de|d'|depuis)\s*(.+?)\s+(?:a|au|aux|jusqu'?a|jusqu'?au|vers)\s+(.+)$/.exec(text.trim());
  if (both) {
    from = clean(both[1]);
    to = clean(both[2]);
  }
  // « aller à Y », « vers Y », « jusqu'à Y »
  if (!to) {
    const dest = /\b(?:jusqu'?(?:a|au|aux)|vers|aller (?:a|au|aux)|rendre (?:a|au|aux)|pour (?:a|au|aux))\s+(.+)$/.exec(text.trim());
    if (dest) to = clean(dest[1]);
  }
  // « c'est loin la préfecture ? »
  if (!to) {
    const far = /\bc'?est loin\s+(.+)$/.exec(text.trim());
    if (far) to = clean(far[1]);
  }
  // « … depuis X »
  const since = /\bdepuis\s+(.+)$/.exec(text.trim());
  if (since) from = clean(since[1]);

  if (!to || to.length < 2) return null;
  if (from && (HOME.test(from) || from.length < 2)) from = null;
  return { to, from };
}

/** Contenu du bloc : « vers: cssm » puis, s'il est donné, « depuis: sada ». */
export const tripSpec = ({ to, from }: TripSpec) => [`vers: ${to}`, from ? `depuis: ${from}` : null].filter(Boolean).join("\n");

/** Lit le contenu du bloc (écrit par le serveur ou par Tamilya). */
export function parseTripSpec(text: string): TripSpec | null {
  const to = /^\s*vers\s*:\s*(.+)$/im.exec(text)?.[1]?.trim();
  const from = /^\s*depuis\s*:\s*(.+)$/im.exec(text)?.[1]?.trim() ?? null;
  return to ? { to: to.slice(0, 120), from: from ? from.slice(0, 120) : null } : null;
}

/** Le bloc à ajouter à la réponse. */
export const tripBlock = (spec: TripSpec) => `\n\n\`\`\`${TRIP_BLOCK}\n${tripSpec(spec)}\n\`\`\``;

/** « 18 min », « 1 h 05 ». */
export function formatMinutes(minutes: number) {
  const m = Math.max(1, Math.round(minutes));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

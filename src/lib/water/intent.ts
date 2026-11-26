/**
 * Eau courante demandée (« y a de l'eau à Koungou ? », « tours d'eau », « carte de l'eau ») :
 * lu par le serveur sur le message. Le bloc ```carte-eau``` ouvre la carte de l'eau dans la
 * conversation (WaterCard). Son contenu : le lieu sur lequel centrer la carte, ou rien.
 */

export const WATER_BLOCK = "carte-eau";

export const waterBlock = (place = "") => `\n\n\`\`\`${WATER_BLOCK}\n${place}\n\`\`\``;

const normalize = (text: string) =>
  ` ${text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")} `;

/** Phrases sans ambiguïté sur l'eau courante. */
const SURE = /\b(?:tours? d ?eau|coupures? d ?eau|coupure de l ?eau|smae|mahoraise des eaux|carte de l ?eau|planning de l ?eau|eau courante|eau du robinet|remise en eau)\b/;
/** « eau » avec une question de présence ou d'heure. */
const WATER = /\b(?:l ?eau|d ?eau|maji)\b/;
const ASK = /\b(?:y a|ya|il y a|est ce qu|reviens?|revient|arrive|coupee?s?|coupe|coupure|ouvert|ouverte|ferme|fermee|quand|a quelle heure|jusqu|secteur|quartier|village|chez moi|robinet|robinets)\b/;
/** Eau de mer, eau de coco, boire de l'eau… : pas l'eau courante. */
const OTHER = /\b(?:eau de (?:mer|coco|pluie|javel|vie|toilette|parfum)|bouteilles? d ?eau|boire de l ?eau|sous l ?eau|dans l ?eau|plongee|baignade|piscine)\b/;

export function detectWater(message: string): boolean {
  const text = normalize(message);
  if (SURE.test(text)) return true;
  return WATER.test(text) && ASK.test(text) && !OTHER.test(text);
}

/**
 * Suite d'une question sur l'eau (« et à Trévani ? ») : la demande d'avant parlait de l'eau,
 * ou la carte de l'eau était dans la dernière réponse. `previousAsk` : présent seulement quand
 * le message est une suite (understand → followUp).
 */
export function followsWater(previousAsk: string | undefined, lastReply = ""): boolean {
  return previousAsk !== undefined && (detectWater(previousAsk) || lastReply.includes("```" + WATER_BLOCK));
}

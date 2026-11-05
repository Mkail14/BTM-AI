/**
 * Message écrit qui demande à Tamilya d'utiliser sa voix (« chante », « dis-le
 * à voix haute ») : le vocal s'ouvre tout seul au lieu d'une réponse écrite.
 * Volontairement prudent : « parle-moi de Mayotte » ou « qui chante ça ? »
 * restent des questions écrites.
 */
const OPENING = /^(?:(?:salut|bonjour|coucou|kwezi|hey|allez|aller|stp|svp|s'il te plait|tamilya)[\s,!.:-]+)*/;
const ASKING = "(?:tu peux|peux[- ]tu|tu pourrais|pourrais[- ]tu|tu sais|sais[- ]tu|vas[- ]y|essaie de|essaye de|je veux que tu|je voudrais que tu|j'aimerais que tu)";
const OUT_LOUD = "(?:a voix haute|en vocal|de vive voix|avec ta voix|a l'oral|en audio)";

const SPOKEN = [
  // Chanter
  /^chante\b/,
  new RegExp(`^${ASKING} (?:me |nous )?chant(?:e|es|er)\\b`),
  /^tu (?:me |nous )chantes?\b/,
  // Parler, sans sujet : « parle-moi de… » reste écrit.
  /^parle(?:[- ]?moi| avec moi)?(?: un peu)?[\s.!?]*$/,
  new RegExp(`^${ASKING} (?:me )?parler(?: avec moi)?[\\s.!?]*$`),
  // Dire les choses à voix haute
  new RegExp(`\\b(?:parle|parles|parler|parlons|dis|dire|reponds|repondre|lis|lire|raconte|raconter|continue|continuons|passe|passons)\\b.*\\b${OUT_LOUD}(?:\\W|$)`),
  /\b(?:entendre|ecouter) ta voix\b/,
];

export function wantsSpokenReply(message: string): boolean {
  const text = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .trim()
    .replace(OPENING, "");
  return SPOKEN.some((pattern) => pattern.test(text));
}

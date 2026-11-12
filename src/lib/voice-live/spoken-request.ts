/**
 * Message écrit qui demande à Tamilya d'utiliser sa voix (« chante », « dis-le
 * à voix haute ») : le vocal s'ouvre tout seul au lieu d'une réponse écrite.
 * Volontairement prudent : « parle-moi de Mayotte » ou « qui chante ça ? »
 * restent des questions écrites.
 */
const OPENING = /^(?:(?:salut|bonjour|coucou|kwezi|hey|allez|aller|stp|svp|s'il te plait|tamilya)[\s,!.:-]+)*/;
const ASKING = "(?:tu peux|peux[- ]tu|tu pourrais|pourrais[- ]tu|tu sais|sais[- ]tu|vas[- ]y|essaie de|essaye de|je veux que tu|je voudrais que tu|j'aimerais que tu)";
const OUT_LOUD = "(?:a voix haute|en vocal|de vive voix|avec ta voix|a l'oral|en audio|en (?:note|message) vocale?)";
/** « Un vocal » comme chose à recevoir : « fais-moi un vocal », « envoie un message vocal ». */
const A_VOICE_NOTE = "(?:un vocal|une vocale|un audio|une? (?:note|message) vocale?)";
/** Question sur le vocal lui-même (« comment marche le vocal ? ») : reste écrite. */
const ABOUT_VOICE = /\b(?:comment|c(?:'| )?est quoi|qu'est[- ]ce|ca marche|marche pas|fonctionne|bug\w*|probleme)\b/;

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
  // N'importe quelle demande « en vocal », quel que soit le verbe : « fais-moi un journal en vocal »,
  // « la météo à voix haute stp » (demande de l'utilisateur, 2026-11-10 : le journal était arrivé écrit).
  new RegExp(`\\b${OUT_LOUD}(?:\\W|$)`),
  new RegExp(`\\b(?:fais|fait|faire|envoie|envoyer|donne|donner|mets|enregistre|je veux|j'aimerais|je voudrais)\\b.*\\b${A_VOICE_NOTE}\\b`),
  // Redire ce qu'elle a écrit : « redis-le », « relis ton message », « parle-moi de ce que tu as écrit ».
  /^(?:re)?(?:dis|lis)[- ](?:le|la|les|moi|ca)(?:[- ]moi)?[\s.!?]*$/,
  /\b(?:redis|redire|relis|relire|repete|repeter|lis|lire|dis|parle|explique)\b.*\b(?:ce que tu (?:as|viens d') ?ecri\w*|ton (?:dernier )?message|ta (?:derniere )?reponse)\b/,
  // « Tu sais parler ? », « pourquoi tu parles pas ? » : elle répond de sa voix.
  /\b(?:pourquoi )?tu (?:ne )?parles? pas\b/,
];

export function wantsSpokenReply(message: string): boolean {
  const text = message
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’`]/g, "'")
    .trim()
    .replace(OPENING, "");
  if (ABOUT_VOICE.test(text) && !/^(?:dis|lis|raconte|chante|fais|donne)\b/.test(text)) return false;
  return SPOKEN.some((pattern) => pattern.test(text));
}

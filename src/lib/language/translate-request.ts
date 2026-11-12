/**
 * « Traduis en shimaoré … » : demande de traduction vers le shimaoré.
 * Réservé aux administrateurs (route du chat) : Tamilya traduit tout le texte
 * avec ce qu'elle sait et signale les mots dont elle n'est pas sûre, au lieu
 * de refuser parce que tout n'est pas dans le lexique.
 */
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const ASK = /\b(tradui[st]?|traduire|traduction|tradu(?:is|isez)[- ]moi|ecris|dis|redige|mets|passe)\b/;
const TARGET = /\b(?:en|vers le|au)\s+(?:shimaor\w*|mahorais|shimaor)\b/;

export function isShimaoreTranslationRequest(message: string): boolean {
  const text = normalize(message).slice(0, 300);
  return ASK.test(text) && TARGET.test(text);
}

export const SHIMAORE_TRANSLATION = [
  "POUR CE MESSAGE : la personne (administrateur de GROUPE BTM) te demande de traduire un texte en shimaoré. Fais-le, même s'il est long : c'est un brouillon qu'elle fera relire.",
  "- Traduis TOUT le texte, phrase par phrase, dans l'ordre. Ne refuse pas, ne commente pas la demande, ne réponds pas seulement avec quelques mots.",
  "- Emploie d'abord les mots du vocabulaire validé. Pour les autres, propose ta meilleure traduction en shimaoré (jamais de kibushi), et écris en italique (*mot*) chaque mot dont tu n'es pas sûre.",
  "- Si tu n'as vraiment aucune idée pour un mot ou un passage, ne l'invente pas : laisse-le en français entre crochets [comme ça] et dis-le franchement après la traduction (« Je ne sais pas traduire : … »). Si tu ne sais traduire presque rien du texte, dis-le en une phrase au lieu de faire semblant.",
  "- Garde tels quels les noms, marques, adresses de site et les mots français qu'on dit déjà ainsi à Mayotte (devis, code, chantier…).",
  "- Après la traduction, au plus deux lignes courtes : « À vérifier : » suivie des mots en italique, et « Je ne sais pas traduire : » suivie des passages laissés en français. Rien s'il n'y en a pas.",
].join("\n");

import { isSmallTalk } from "@/lib/ai/small-talk";

/**
 * Demande d'information qui mérite une recherche sur internet avant la réponse :
 * une question (qui, quel, quand, combien, c'est quoi…) sur un fait qui peut changer
 * ou que le modèle ne connaît pas forcément (personne en poste, prix, horaire, résultat,
 * actualité, date…). Le serveur cherche alors lui-même, pendant qu'il prépare le message :
 * les petits modèles oublient souvent leur outil de recherche quand les consignes sont longues.
 * Règles simples, sans appel en plus ; dans le doute, pas de recherche (la réponse reste rapide).
 */
const QUESTION = /\?|^(?:qui|quel(?:le)?s?|quand|combien|o[uù]|comment s'appelle|c'est quoi|c'est qui|qu'est-ce qu|est-ce qu|y a-t-il|il y a)\b/;

const CHANGING_FACT = new RegExp(
  [
    // Personne en poste
    "\\bqui (?:est|sont|a|ont|dirige|gouverne)\\b", "pr[ée]sident", "ministre", "maire", "pr[ée]fet", "d[ée]put[ée]", "s[ée]nat", "gouvernement", "[ée]lu",
    "directeur", "directrice", "patron", "pdg", "entra[iî]neur", "s[ée]lectionneur",
    // Ce qui change
    "actuel", "en ce moment", "aujourd'hui", "maintenant", "dernier", "derni[èe]re", "r[ée]cent", "nouveau", "prochain", "prochaine", "cette ann[ée]e",
    "\\b20[2-3]\\d\\b",
    // Chiffres et dates
    "prix", "tarif", "co[uû]te?", "combien", "salaire", "smic", "taux", "population", "nombre d", "date", "depuis quand", "quand",
    "horaire", "ouvert", "ferm[ée]", "r[ée]sultat", "score", "match", "gagn[ée]", "classement", "sortie", "sorti",
    // Lois et actualité
    "\\bloi\\b", "r[ée]forme", "d[ée]cret", "actu", "nouvelles",
  ].join("|"),
);

/** Conseils et demandes personnelles : la recherche n'aide pas (« comment je fais pour… »). */
const PERSONAL = /^(?:comment (?:je|on|tu|faire)|aide-moi|explique|[ée]cris|r[ée]dige|traduis|corrige|fais|donne-moi une id[ée]e)\b/;

export function needsWebSearch(message: string): boolean {
  const text = message.toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim();
  if (text.length < 8 || text.length > 400 || isSmallTalk(text) || PERSONAL.test(text)) return false;
  return QUESTION.test(text) && CHANGING_FACT.test(text);
}

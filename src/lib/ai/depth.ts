/**
 * Raisonnement adaptatif, sans appel en plus : quelques règles décident si un
 * message mérite une vraie réflexion (projet, comparaison, calcul, conseil) et
 * s'il faut chercher sur internet (actualité, date, chiffre, fait vérifiable).
 * « Coucou » reste instantané ; « mon projet de snack est-il rentable ? »
 * déclenche l'analyse.
 */

const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const DEEP =
  /\b(explique|expliquer|analyse|analyser|compare|comparer|comparaison|difference|avantages?|inconvenients?|strategie|plan|planifie|etapes?|projet|business|entreprise|rentable|rentabilite|budget|devis|calcule|calculer|combien (?:ca|cela|je|on) (?:coute|couterait|gagne)|pourquoi|comment (?:faire|je peux|on peut|creer|monter|lancer|ameliorer)|conseille|conseil|recommande|que penses?-tu|ton avis|est-ce une bonne idee|risques?|probleme|resoudre|solution|optimiser|ameliorer|rediger|ecris(?:-moi)? un|resume|synthese|demarches?|dossier)\b/;

const SEARCH =
  /\b(actualite|actu|news|aujourd'hui|hier|cette semaine|ce mois|en ce moment|recemment|dernier|derniere|nouveau|nouvelle loi|resultat|score|match|election|prix (?:du|de la|des)|tarif|horaires?|ouvert|ferme|adresse|telephone|numero|site|quand|en quelle annee|date|qui est|qui etait|combien (?:d'habitants|de|y a)|population|statistiques?|chiffres?|meteo|cyclone|greve|prefet|maire|depute|senateur|president|ministre|officiel|loi|decret|reforme|histoire de|s'est passe|evenement)\b/;

/** Mérite une réflexion approfondie (et une réponse développée si besoin). */
export function isComplexRequest(message: string): boolean {
  const text = normalize(message);
  if (text.length > 280) return true;
  if (text.length < 12) return false;
  return DEEP.test(text) || (text.match(/\?/g)?.length ?? 0) >= 2;
}

/** Une recherche internet a de bonnes chances d'être utile (faits, actualité, chiffres). */
export function needsWebSearch(message: string): boolean {
  const text = normalize(message);
  if (text.length < 12) return false;
  return SEARCH.test(text);
}

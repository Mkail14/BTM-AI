/** Minuscules sans accents. */
export const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const JOBS = /\b(emplois?|offres?|travail|travailler|job|jobs|boulot|recrut\w*|embauch\w*|cdi|cdd|interim|stage|alternance|candidat\w*|postuler|chomage|france travail|pole emploi)\b/;
const NEWS =
  /\b(actus?|actualites?|nouvelles?|nouveau|nouveaute|infos?|informations?|news|journal|journaux|presse|quoi de neuf|se passe|passe-t-il|passe t il|evenements?|aujourd'hui|hier|ce matin|ce soir|en ce moment|cette semaine|ce week-?end|recemment|derniere?s?|dernier|derniere minute|faits? divers|greve|manif\w*|cyclone|coupure|penurie|elections?|prefet|prefecture|maire|conseil departemental)\b/;

/** Ce que demande le message : des offres d'emploi, l'actualité, ou rien de tout ça. */
export function liveIntent(message: string): { jobs: boolean; news: boolean } {
  const text = normalize(message);
  return { jobs: JOBS.test(text), news: NEWS.test(text) };
}

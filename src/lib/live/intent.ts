/** Minuscules sans accents. */
const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const JOBS = /\b(emplois?|offres?|travail|travailler|job|jobs|boulot|recrut\w*|embauch\w*|cdi|cdd|interim|stage|alternance|candidat\w*|postuler|chomage|france travail|pole emploi)\b/;
const NEWS = /\b(actus?|actualites?|nouvelles?|infos?|news|journal|journaux|quoi de neuf|il se passe|se passe quoi|evenements?|aujourd'hui|en ce moment|cette semaine|derniere?s? minute)\b/;

/** Ce que demande le message : des offres d'emploi, l'actualité, ou rien de tout ça. */
export function liveIntent(message: string): { jobs: boolean; news: boolean } {
  const text = normalize(message);
  return { jobs: JOBS.test(text), news: NEWS.test(text) };
}

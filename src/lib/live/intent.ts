/** Minuscules sans accents. */
export const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

const JOBS = /\b(emplois?|offres?|travail|travailler|job|jobs|boulot|recrut\w*|embauch\w*|cdi|cdd|interim|stage|alternance|candidat\w*|postuler|chomage|france travail|pole emploi)\b/;
const NEWS =
  /\b(actus?|actualites?|nouvelles?|nouveau|nouveaute|infos?|informations?|news|journal|journaux|presse|quoi de neuf|se passe|passe-t-il|passe t il|evenements?|aujourd'hui|hier|ce matin|ce soir|en ce moment|cette semaine|ce week-?end|recemment|derniere?s?|dernier|derniere minute|faits? divers|greve|manif\w*|cyclone|coupure|penurie|elections?|prefet|prefecture|maire|conseil departemental)\b/;

const WEATHER = /\b(meteo|quel temps|il fait (beau|chaud|froid)|pluie|pleu\w*|pleut|soleil|chaleur|vents?|orages?|temperatures?|degres|averses?|nuageux)\b/;
const CYCLONES = /\b(cyclones?|cycloniques?|typhons?|tempetes? tropicales?|depressions? tropicales?|perturbations? tropicales?|ouragans?|kimbunga|tufani)\b/;
const COMMUNES = /\b(habitants?|population|codes? postaux|code postal|communes?|combien de (gens|personnes))\b/;

/** Ce que demande le message : offres d'emploi, actualité, météo, cyclones, communes (ou rien de tout ça). */
export function liveIntent(message: string): { jobs: boolean; news: boolean; weather: boolean; cyclones: boolean; communes: boolean } {
  const text = normalize(message);
  return { jobs: JOBS.test(text), news: NEWS.test(text), weather: WEATHER.test(text), cyclones: CYCLONES.test(text), communes: COMMUNES.test(text) };
}

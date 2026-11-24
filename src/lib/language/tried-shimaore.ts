/**
 * Tamilya a-t-elle essayé de parler shimaoré dans cette réponse ? Sert à
 * n'afficher « C'est juste » et « Corriger » que sous ses réponses en shimaoré :
 * une réponse tout en français n'a rien à corriger.
 */

/** Petits mots français très courants : un texte français en est plein, le shimaoré presque jamais. */
const FRENCH = new Set(
  `le la les un une des du de d l au aux et ou mais donc car ni que qu qui quoi dont où ce cet cette ces
  je j tu il elle on nous vous ils elles me m te t se s lui leur leurs y en
  mon ma mes ton ta tes son sa ses notre nos votre vos
  est es suis sont sommes êtes était être ai as avons avez ont avoir fait faire va vais vont peut peux pouvez
  ne n pas plus jamais rien très bien aussi encore déjà toujours ici là comme pour par sur sous dans avec sans chez entre vers
  si oui non merci bonjour bonsoir salut alors puis quand comment pourquoi combien
  c ça cela ceci tout tous toute toutes autre même voici voilà`.split(/\s+/),
);

/** Débuts de mots propres au shimaoré, qu'aucun mot français ne prend. */
const SHIMAORE_START = /^(mb|nd|ng|ny[aeiou]|mw|kw|dz|ts[aeiou]|mt|mk|mh|nts|nz|nk|pv|bw|hw|shi|wa[mw])/;

/** Mots shimaoré courants qui ne ressemblent à rien de français. */
const SHIMAORE_WORDS = new Set(
  "jeje jéjé marahaba ewa kayi ndio wami wawe yeye rihi sisi nyani tsena tsi namna haya hayo ata hata wahe mahaba karibu fetre fétré".split(" "),
);

export function triedShimaore(reply: string): boolean {
  // Passage resté en français entre [[ ]] ou mot dont elle n'est pas sûre en italique : elle a essayé.
  if (reply.includes("[[") || /(^|[^*\w])[*_][^*_\s][^*_]*[*_](?![*\w])/.test(reply)) return true;

  const words = reply
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[’']/g, " ")
    .split(/[^a-zA-ZÀ-ÿœŒ-]+/)
    .filter((w) => w.length > 1);
  if (!words.length) return false;

  // Les noms de lieux (Dzaoudzi, Mtsamboro…) ont une majuscule : seuls les mots en minuscules comptent.
  if (words.some((w) => SHIMAORE_WORDS.has(w.toLowerCase()) || (w === w.toLowerCase() && SHIMAORE_START.test(w)))) return true;

  // Peu de petits mots français : ce n'est pas du français (trop court pour en juger : non).
  if (words.length < 4) return false;
  const french = words.filter((w) => FRENCH.has(w.toLowerCase())).length;
  return french / words.length < 0.2;
}

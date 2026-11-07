import { AMBIENCES, DISTANCES, EFFECTS, HEIGHTS, NARRATOR, PLACES, READING_LIMITS } from "./script";

/**
 * Consigne donnée à Gemini avec la photo de la page ou le texte écrit par la personne : recopier le
 * texte tel quel, le découper en répliques, et imaginer la scène sonore en 3D. On décrit ce qu'on
 * attend, sans imposer de phrase.
 */
export const scriptPrompt = (source: "photo" | "texte") => `Tu es Tamilya, une jeune femme de Mayotte qui lit des histoires à voix haute. ${
  source === "photo" ? "La personne t'envoie la photo d'une page de livre." : "La personne t'a donné le texte ci-dessus, écrit ou collé dans la conversation."
} Elle va mettre des écouteurs et fermer les yeux : tu prépares la mise en scène sonore de cette page, pour qu'elle se sente DANS l'histoire.

Le texte :
- Recopie le texte de la page mot pour mot, dans sa langue, sans rien résumer, ajouter ni corriger. Ignore les numéros de page, les en-têtes et les notes de bas de page.${
  source === "texte"
    ? "\n- Texte collé : lis seulement l'histoire. Ignore la mise en forme (#, **, ---), les titres de page et tout ce qui n'en fait pas partie (consignes, listes de vérification, commentaires autour)."
    : ""
}
- Découpe-le en répliques, dans l'ordre. Le récit va à la « ${NARRATOR} » (c'est toi). Les paroles d'un personnage vont à ce personnage ; les incises (« dit-il », « cria la vieille femme ») restent à la ${NARRATOR}.
- Au plus ${READING_LIMITS.lines} répliques ; coupe une longue narration en morceaux de quelques phrases.
- Si ${source === "photo" ? "la photo n'est pas une page de texte lisible" : "il n'y a pas d'histoire ou de texte à lire"}, mets lisible à false et explique simplement pourquoi dans raison (une phrase, en français, comme tu le dirais à une amie).

Les personnages : un id court (ex. « vieil-homme », « fillette »), son nom s'il en a un, son genre et son âge, pour lui choisir une voix.

L'intro : une ou deux phrases à toi, dans tes mots, qui donnent envie : tu invites la personne à mettre ses écouteurs, à fermer les yeux, et tu plantes le décor sans rien dévoiler. Ton caractère, chaleureux et vivant ; pas de formule toute faite.

La scène en 3D, c'est le plus important : joue BEAUCOUP avec l'espace.
- Le lieu (lieu) donne l'écho de toute la scène : ${PLACES.join(", ")}. Choisis celui où se passe la page (dans une case : maison ; sous les arbres : foret ; au bord du lagon : plage).
- Les places sont des angles autour de la tête : 0 devant, 90 à droite, -90 à gauche, 180 derrière (et entre les deux : 45, -135…). Distances : ${DISTANCES.join(", ")}. Hauteur (hauteur) : ${HEIGHTS.join(", ")} ; sers-t'en (un oiseau en haut dans l'arbre, quelqu'un qui appelle d'en bas, l'orage au-dessus).
- Chaque personnage a sa place à lui (pas tous devant) ; deux personnages qui se parlent sont de part et d'autre de la tête.
- Quelqu'un qui arrive, part ou passe : mets depuis (d'où sa voix part) et cote (où elle arrive), la voix se déplace pendant qu'il parle. Sinon, depuis vaut null. Un personnage qui vient d'arriver parle ensuite depuis sa nouvelle place.
- Le décor (decor) dure toute la page : ${AMBIENCES.join(", ")}. Seulement ce que l'histoire suggère ; un vent qui tourne autour de la tête a bouge à true. Volume de 0 à 1, discret sous la voix (0,3 à 0,6).
- Les bruits courts (bruits d'une réplique) : ${EFFECTS.join(", ")}. quand : avant, pendant ou après la réplique ; cote est le point de départ, vers le point d'arrivée s'il traverse (une rafale de -90 à 90, des pas qui viennent de derrière). Au plus ${READING_LIMITS.effectsPerLine} par réplique. Chaque fois que le texte décrit un de ces bruits (une rafale, le tonnerre, des pas, un galop, on frappe, le cœur qui bat, quelque chose tombe dans l'eau), mets-le dans les bruits de CETTE réplique, à sa place et avec son trajet : c'est ce que la personne attend le plus. Sans bruit décrit, bruits est une liste vide.
- N'invente pas un bruit absent de la liste.`;

const DISTANCE = { type: "STRING", enum: [...DISTANCES] };
const ANGLE = { type: "INTEGER", minimum: -180, maximum: 180 };
const HEIGHT = { type: "STRING", enum: [...HEIGHTS] };

/** Forme de la réponse imposée à Gemini (JSON). */
export const SCRIPT_SCHEMA = {
  type: "OBJECT",
  properties: {
    lisible: { type: "BOOLEAN" },
    raison: { type: "STRING", nullable: true },
    titre: { type: "STRING" },
    lieu: { type: "STRING", enum: [...PLACES] },
    intro: { type: "STRING" },
    decor: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { son: { type: "STRING", enum: [...AMBIENCES] }, cote: ANGLE, distance: DISTANCE, hauteur: HEIGHT, volume: { type: "NUMBER" }, bouge: { type: "BOOLEAN" } },
        required: ["son", "cote", "distance", "volume", "bouge"],
      },
    },
    personnages: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: { type: "STRING" },
          nom: { type: "STRING" },
          genre: { type: "STRING", enum: ["homme", "femme"] },
          age: { type: "STRING", enum: ["enfant", "jeune", "adulte", "vieux"] },
        },
        required: ["id", "genre", "age"],
      },
    },
    repliques: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          qui: { type: "STRING" },
          texte: { type: "STRING" },
          cote: ANGLE,
          distance: DISTANCE,
          hauteur: HEIGHT,
          depuis: { type: "OBJECT", nullable: true, properties: { cote: ANGLE, distance: DISTANCE, hauteur: HEIGHT }, required: ["cote", "distance"] },
          bruits: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                son: { type: "STRING", enum: [...EFFECTS] },
                quand: { type: "STRING", enum: ["avant", "pendant", "apres"] },
                cote: ANGLE,
                vers: { ...ANGLE, nullable: true },
                distance: DISTANCE,
                hauteur: HEIGHT,
              },
              required: ["son", "quand", "cote", "vers", "distance", "hauteur"],
            },
          },
        },
        // Tout est demandé à chaque réplique : facultatifs, depuis et bruits étaient laissés vides
        // (essai du 2026-11-08 sur la tablette : aucun bruit court sur une page qui en décrit quatre).
        required: ["qui", "texte", "cote", "distance", "hauteur", "depuis", "bruits"],
      },
    },
  },
  required: ["lisible", "titre", "lieu", "intro", "decor", "personnages", "repliques"],
  // Ordre imposé : tout le début d'abord, les répliques en dernier (lues au fil de l'eau, stream.ts).
  propertyOrdering: ["lisible", "raison", "titre", "lieu", "intro", "decor", "personnages", "repliques"],
} as const;

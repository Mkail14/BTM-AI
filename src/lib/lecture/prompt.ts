import { DISTANCES, HEIGHTS, NARRATOR, PLACES, READING_LIMITS } from "./script";
import { AMBIENCES as ALL_AMBIENCES, EFFECTS as ALL_EFFECTS, describe } from "./bank";
import { isPlayable } from "./sounds";

/** Seulement les sons qu'on peut vraiment jouer (enregistrés ou fabriqués). */
const AMBIENCES = ALL_AMBIENCES.filter(isPlayable);
const EFFECTS = ALL_EFFECTS.filter(isPlayable);

/**
 * Consigne donnée à Gemini : avec la photo d'une page ou le texte écrit par la personne, recopier
 * le texte tel quel et le découper en répliques ; pour une histoire demandée (« lis-moi une
 * histoire »), l'inventer directement en répliques. Puis imaginer la scène sonore en 3D.
 * On décrit ce qu'on attend, sans imposer de phrase.
 */
export type ScriptSource = "photo" | "texte" | "histoire";

const GIVEN = (source: "photo" | "texte") => `Le texte :
- Recopie le texte de la page mot pour mot, dans sa langue, sans rien résumer, ajouter ni corriger. Ignore les numéros de page, les en-têtes et les notes de bas de page.${
  source === "texte"
    ? "\n- Texte collé : lis seulement l'histoire. Ignore la mise en forme (#, **, ---), les titres de page et tout ce qui n'en fait pas partie (consignes, listes de vérification, commentaires autour)."
    : ""
}
- Découpe-le en répliques, dans l'ordre. Le récit va à la « ${NARRATOR} » (c'est toi). Les paroles d'un personnage vont à ce personnage ; les incises (« dit-il », « cria la vieille femme ») restent à la ${NARRATOR}.
- Au plus ${READING_LIMITS.lines} répliques ; coupe une longue narration en morceaux de quelques phrases.
- Si ${source === "photo" ? "la photo n'est pas une page de texte lisible" : "il n'y a pas d'histoire ou de texte à lire"}, mets lisible à false et explique simplement pourquoi dans raison (une phrase, en français, comme tu le dirais à une amie).`;

const INVENTED = `L'histoire :
- Invente une histoire originale, faite pour être écoutée les yeux fermés au casque : 250 à 450 mots, un début qui accroche, un moment fort, une fin. Jamais une histoire existante ni ses personnages.
- Suis la demande ci-dessus (sujet, style, âge, langue) ; si elle ne dit rien, c'est une histoire de chez nous, à Mayotte. En français, sauf si elle demande une autre langue (en shimaoré, seulement avec des mots que tu connais vraiment).
- Écris-la pour l'oreille : des personnages qui se parlent et se déplacent, des bruits qu'on entend (la vie de Mayotte : pluie sur la tôle, coq, appel à la prière, scooter, marché, vagues du lagon, toux, porte qui grince…), des surprises venues de derrière ou d'en haut.
- Découpe-la directement en répliques, dans l'ordre : le récit à la « ${NARRATOR} » (c'est toi), les paroles à chaque personnage (deux à quatre personnages). Au plus ${READING_LIMITS.lines} répliques, souvent courtes.
- lisible vaut true.`;

export const scriptPrompt = (source: ScriptSource) => `Tu es Tamilya, une jeune femme de Mayotte qui raconte et lit des histoires à voix haute. ${
  source === "photo"
    ? "La personne t'envoie la photo d'une page de livre."
    : source === "texte"
      ? "La personne t'a donné le texte ci-dessus, écrit ou collé dans la conversation."
      : "La personne t'a demandé une histoire (sa demande est ci-dessus) : c'est toi qui l'inventes."
} Elle va mettre des écouteurs et fermer les yeux : tu prépares la mise en scène sonore, pour qu'elle se sente DANS l'histoire.

${source === "histoire" ? INVENTED : GIVEN(source)}

Les personnages : un id court (ex. « vieil-homme », « fillette »), son nom s'il en a un, son genre et son âge, pour lui choisir une voix.

L'intro : une ou deux phrases à toi, dans tes mots, qui donnent envie : tu invites la personne à mettre ses écouteurs, à fermer les yeux, et tu plantes le décor sans rien dévoiler. Ton caractère, chaleureux et vivant ; pas de formule toute faite.

La fin (fin) : une phrase à toi, dite juste après l'histoire, quand la personne rouvre les yeux : tu prends de ses nouvelles ou tu lui demandes ce qu'elle en a pensé, avec tes mots, comme une amie ; pas de formule toute faite.

La scène en 3D, c'est le plus important : joue BEAUCOUP avec l'espace.
- Le lieu (lieu) donne l'écho de toute la scène : ${PLACES.join(", ")}. Choisis celui où se passe la page (dans une case : maison ; sous les arbres : foret ; au bord du lagon : plage).
- Les places sont des angles autour de la tête : 0 devant, 90 à droite, -90 à gauche, 180 derrière (et entre les deux : 45, -135…). Distances : ${DISTANCES.join(", ")}. Hauteur (hauteur) : ${HEIGHTS.join(", ")} ; sers-t'en (un oiseau en haut dans l'arbre, quelqu'un qui appelle d'en bas, l'orage au-dessus).
- Chaque personnage a sa place à lui (pas tous devant) ; deux personnages qui se parlent sont de part et d'autre de la tête.
- Quelqu'un qui arrive, part ou passe : mets depuis (d'où sa voix part) et cote (où elle arrive), la voix se déplace pendant qu'il parle. Sinon, depuis vaut null. Un personnage qui vient d'arriver parle ensuite depuis sa nouvelle place.
- Le décor (decor) dure toute la page : ${describe(AMBIENCES)}. Seulement ce que l'histoire suggère ; un vent qui tourne autour de la tête a bouge à true. Volume de 0 à 1, discret sous la voix (0,3 à 0,6).
- Les bruits courts (bruits d'une réplique) : ${describe(EFFECTS)}. quand : avant, pendant ou après la réplique ; cote est le point de départ, vers le point d'arrivée s'il traverse (une rafale de -90 à 90, des pas qui viennent de derrière). Au plus ${READING_LIMITS.effectsPerLine} par réplique. Chaque fois que le texte décrit un de ces bruits (une rafale, des pas, on frappe, quelqu'un tousse ou crie, un coq, un scooter qui passe, l'appel à la prière au loin), mets-le dans les bruits de CETTE réplique, à sa place et avec son trajet : c'est ce que la personne attend le plus. Sans bruit décrit, bruits est une liste vide.
- N'invente pas un bruit absent de la liste. L'appel à la prière, le prêche, la madrassa et « Allahou akbar » se placent avec respect (le moment de la prière, la vie du quartier), jamais pour faire peur ni pour rire.`;

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
    fin: { type: "STRING" },
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
  required: ["lisible", "titre", "lieu", "intro", "fin", "decor", "personnages", "repliques"],
  // Ordre imposé : tout le début d'abord, les répliques en dernier (lues au fil de l'eau, stream.ts).
  propertyOrdering: ["lisible", "raison", "titre", "lieu", "intro", "fin", "decor", "personnages", "repliques"],
} as const;

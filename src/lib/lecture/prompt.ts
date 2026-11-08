import { DISTANCES, HEIGHTS, NARRATOR, PLACES, READING_LIMITS } from "./script";
import { BUILTIN_CATALOG, usableSounds, type CatalogSound, type SoundKind } from "./catalog";

/**
 * Seulement les sons branchés dans /admin/sons et qu'on peut vraiment jouer (fichier ou version
 * fabriquée), rangés par sorte. Gemini choisit dans cette liste, à chaque histoire.
 */
function byKind(catalog: CatalogSound[]): Record<SoundKind, CatalogSound[]> {
  const usable = usableSounds(catalog);
  return { decor: usable.filter((s) => s.kind === "decor"), bruit: usable.filter((s) => s.kind === "bruit"), musique: usable.filter((s) => s.kind === "musique") };
}

/** Pour la consigne de Gemini : « id (ce que c'est) ». */
const describe = (sounds: CatalogSound[]) =>
  sounds.length ? sounds.map((s) => `${s.id} (${s.name}${s.scary && s.kind !== "musique" ? ", fait peur" : ""})`).join(", ") : "aucun pour l'instant";

/** Liste pour le schéma JSON : jamais vide (Gemini refuse une liste vide ; « aucun » est écarté ensuite). */
const ids = (sounds: CatalogSound[]) => (sounds.length ? sounds.map((s) => s.id) : ["aucun"]);

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

export const scriptPrompt = (source: ScriptSource, catalog: CatalogSound[] = BUILTIN_CATALOG) => {
  const sounds = byKind(catalog);
  return `Tu es Tamilya, une jeune femme de Mayotte qui raconte et lit des histoires à voix haute. ${
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

La musique (musique), comme au cinéma : une musique de fond discrète sous les voix, choisie pour le ton de l'histoire : ${describe(sounds.musique)}. Presque toujours une ; null seulement si une musique ne convient pas (un texte religieux, une prière, une page de cours). C'est le ton qui décide : une histoire drôle n'a jamais horreur ni suspense. Dans une réplique, musique change l'ambiance à partir de là quand le ton bascule vraiment (le calme qui tourne à la peur, la poursuite qui finit dans la joie), deux ou trois fois au plus dans l'histoire ; « silence » coupe la musique (juste avant un moment fort). Sinon, musique vaut null dans la réplique.

La scène en 3D, c'est le plus important : joue BEAUCOUP avec l'espace, comme un film de cinéma qu'on écouterait sans l'image. On doit sentir les gens bouger autour de sa tête.
- Le lieu (lieu) donne l'écho de toute la scène : ${PLACES.join(", ")}. Choisis celui où se passe la page (dans une case : maison ; sous les arbres : foret ; au bord du lagon : plage).
- Les places sont des angles autour de la tête : 0 devant, 90 à droite, -90 à gauche, 180 derrière (et entre les deux : 45, -135…). Distances : ${DISTANCES.join(", ")}. Hauteur (hauteur) : ${HEIGHTS.join(", ")} ; sers-t'en (un oiseau en haut dans l'arbre, quelqu'un qui appelle d'en bas, l'orage au-dessus).
- Chaque personnage a sa place à lui (pas tous devant) ; deux personnages qui se parlent sont de part et d'autre de la tête.
- Les personnages bougent souvent, pas seulement en arrivant. Quelqu'un qui arrive, part ou passe : depuis (d'où sa voix part) et cote (où elle arrive), la voix se déplace pendant qu'il parle ; sinon depuis vaut null. Quelqu'un qui marche en parlant, tourne autour de la personne, fait les cent pas, passe derrière elle ou s'éloigne en criant : trajet donne les points par où passe sa voix (dans l'ordre, avant d'arriver à cote), sinon trajet est une liste vide. Une voix garde sa place d'une réplique à l'autre : si tu changes son cote, on l'entend marcher jusque-là.
- Utilise toute la sphère : devant, derrière, les côtés, en haut, en bas, tout près de l'oreille (tout-pres, pour un secret ou une surprise), très loin (tres-loin, quelqu'un qui appelle depuis l'autre bout du village).
- Quand la ${NARRATOR} imite un bruit avec sa voix (« toc, toc, toc », « boum », « plouf », « vroum », un cri d'animal), mets ce bruit seul dans une réplique courte à elle, avec bruitage à true et le cote, la distance et la hauteur de l'endroit d'où vient le bruit (la porte à gauche, le ciel au-dessus) ; si le bruit voyage, ajoute depuis et trajet. Tu peux aussi ajouter le vrai bruit de la liste dans cette réplique (frapper avec « toc, toc »). Pour tout le reste du récit, bruitage vaut false (elle reste au milieu, son cote ne compte pas). Ne change pas le texte d'une page donnée pour cela : découpe seulement.
- Le décor (decor) dure toute la page : ${describe(sounds.decor)}. Seulement ce que l'histoire suggère ; un vent qui tourne autour de la tête a bouge à true. Volume de 0 à 1, discret sous la voix (0,3 à 0,6).
- Les bruits courts (bruits d'une réplique) : ${describe(sounds.bruit)}. quand : avant, pendant ou après la réplique ; cote est le point de départ, vers le point d'arrivée s'il bouge (une rafale de -90 à 90, des pas qui viennent de derrière), sinon null ; trajet donne des points de passage entre les deux, chacun avec sa distance (un scooter qui arrive de très loin à gauche, frôle la personne devant et repart loin à droite : cote -100 tres-loin, trajet [0 tout-pres], vers 100 ; qui s'éloigne : trajet [cote loin]). Fais bouger tout ce qui bouge dans la vraie vie : pas, véhicules, animaux, vent, pluie qui arrive. Ce qui passe s'entend comme au cinéma : plus aigu quand ça arrive, plus grave quand ça repart. Au plus ${READING_LIMITS.effectsPerLine} par réplique. Chaque fois que le texte décrit un de ces bruits (une rafale, des pas, on frappe, quelqu'un tousse ou crie, un coq, un scooter qui passe, l'appel à la prière au loin), mets-le dans les bruits de CETTE réplique, à sa place et avec son trajet : c'est ce que la personne attend le plus. Sans bruit décrit, bruits est une liste vide.
- N'invente pas un bruit absent de la liste. L'appel à la prière, le prêche, la madrassa et « Allahou akbar » se placent avec respect (le moment de la prière, la vie du quartier), jamais pour faire peur ni pour rire.
- Le son suit le ton de l'histoire. Une histoire drôle ou joyeuse doit sonner gaie, comme une comédie : décor de jour et vivant (enfants qui jouent, marché, oiseaux, coq, chèvres), bruits qui font sourire (éternuement, chèvre, klaxon, poules), lieu ouvert sans grand écho (jamais grotte ni grande-salle) ; pas de cœur qui bat, de porte qui grince, de tonnerre, de rafale ni de nuit inquiétante. Une histoire douce ou pour dormir reste calme et discrète. Les sons qui font peur sont réservés aux histoires qui doivent faire peur ou au suspense.
- Mayotte est une île musulmane : une histoire de chez nous a les sons de chez nous (l'appel à la prière au loin, la madrassa, les roussettes le soir), jamais de cloches d'église.`;
};

const DISTANCE = { type: "STRING", enum: [...DISTANCES] };
const ANGLE = { type: "INTEGER", minimum: -180, maximum: 180 };
const HEIGHT = { type: "STRING", enum: [...HEIGHTS] };
const TRAJET = {
  type: "ARRAY",
  maxItems: READING_LIMITS.waypoints,
  items: { type: "OBJECT", properties: { cote: ANGLE, distance: DISTANCE, hauteur: HEIGHT }, required: ["cote", "distance", "hauteur"] },
};

/** Forme de la réponse imposée à Gemini (JSON), avec les sons du moment. */
export function scriptSchema(catalog: CatalogSound[] = BUILTIN_CATALOG) {
  const sounds = byKind(catalog);
  const AMBIENCES = ids(sounds.decor);
  const EFFECTS = ids(sounds.bruit);
  const MOOD_IDS = ids(sounds.musique);
  const MUSIC_CHANGES = [...MOOD_IDS, "silence"];
  return {
    type: "OBJECT",
    properties: {
      lisible: { type: "BOOLEAN" },
      raison: { type: "STRING", nullable: true },
      titre: { type: "STRING" },
      lieu: { type: "STRING", enum: [...PLACES] },
      intro: { type: "STRING" },
      fin: { type: "STRING" },
      musique: { type: "STRING", enum: [...MOOD_IDS], nullable: true },
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
            trajet: TRAJET,
            bruitage: { type: "BOOLEAN" },
            musique: { type: "STRING", enum: [...MUSIC_CHANGES], nullable: true },
            bruits: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  son: { type: "STRING", enum: [...EFFECTS] },
                  quand: { type: "STRING", enum: ["avant", "pendant", "apres"] },
                  cote: ANGLE,
                  vers: { ...ANGLE, nullable: true },
                  trajet: TRAJET,
                  distance: DISTANCE,
                  hauteur: HEIGHT,
                },
                required: ["son", "quand", "cote", "vers", "trajet", "distance", "hauteur"],
              },
            },
          },
          // Tout est demandé à chaque réplique : facultatifs, depuis et bruits étaient laissés vides
          // (essai du 2026-11-08 sur la tablette : aucun bruit court sur une page qui en décrit quatre).
          required: ["qui", "texte", "cote", "distance", "hauteur", "depuis", "trajet", "bruitage", "musique", "bruits"],
        },
      },
    },
    required: ["lisible", "titre", "lieu", "intro", "fin", "musique", "decor", "personnages", "repliques"],
    // Ordre imposé : tout le début d'abord, les répliques en dernier (lues au fil de l'eau, stream.ts).
    propertyOrdering: ["lisible", "raison", "titre", "lieu", "intro", "fin", "musique", "decor", "personnages", "repliques"],
  } as const;
}

/** Schéma avec les sons d'origine seulement (tests). */
export const SCRIPT_SCHEMA = scriptSchema();

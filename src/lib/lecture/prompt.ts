import { DISTANCES, HEIGHTS, NARRATOR, PLACES, READING_LIMITS } from "./script";
import { BUILTIN_CATALOG, usableSounds, type CatalogSound, type SoundKind } from "./catalog";
import type { BookContext } from "./book";

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
export type ScriptSource = "photo" | "texte" | "histoire" | "ecrite" | "livre";

const GIVEN = (source: "photo" | "texte" | "ecrite") => `Le texte :
- Recopie le texte de la page mot pour mot, dans sa langue, sans rien résumer, ajouter ni corriger. Ignore les numéros de page, les en-têtes et les notes de bas de page.${
  source === "texte"
    ? "\n- Texte collé : lis seulement l'histoire. Ignore la mise en forme (#, **, ---), les titres de page et tout ce qui n'en fait pas partie (consignes, listes de vérification, commentaires autour)."
    : source === "photo"
      ? "\n- Capture d'écran ou photo d'un écran, d'un message, d'une affiche : lis le texte qu'on y lit, dans l'ordre. Ignore l'heure, la batterie, les boutons, les menus et les icônes de l'application. Dans une conversation (SMS, WhatsApp…), chaque personne qui écrit est un personnage."
      : ""
}
- Découpe-le en répliques, dans l'ordre. Le récit va à la « ${NARRATOR} » (c'est toi). Les paroles d'un personnage vont à ce personnage ; les incises (« dit-il », « cria la vieille femme ») restent à la ${NARRATOR}.
- Au plus ${READING_LIMITS.lines} répliques ; coupe une longue narration en morceaux de quelques phrases.
- Si ${source === "photo" ? "l'image n'a pas de texte lisible" : "il n'y a pas d'histoire ou de texte à lire"}, mets lisible à false et explique simplement pourquoi dans raison (une phrase, en français, comme tu le dirais à une amie).`;

const INVENTED = `L'histoire :
- Invente une histoire originale, faite pour être écoutée les yeux fermés au casque : 250 à 450 mots, un début qui accroche, un moment fort, une fin. Jamais une histoire existante ni ses personnages.
- Suis la demande ci-dessus (sujet, genre, âge, lieu, langue). Le lieu et l'époque sont libres : une ville, la mer, une forêt, l'espace, un royaume de conte, un autre pays, une école… Mayotte seulement si la demande en parle (Mayotte, un village ou une ville de l'île, « chez nous », le shimaoré) ; sinon, change d'univers d'une histoire à l'autre. En français, sauf si elle demande une autre langue (en shimaoré, seulement avec des mots que tu connais vraiment).
- Sans genre demandé, choisis celui qui va au sujet. La peur seulement si on la demande ou si le sujet l'appelle (fantôme, monstre, maison hantée).
- Chaque genre se raconte à sa façon, jamais comme un film d'horreur :
  - drôle : des situations qui dérapent, des malentendus, des personnages qui se chamaillent, une chute qui fait rire ; rythme vif, répliques courtes.
  - aventure : un but, des obstacles, de l'élan, beaucoup de mouvement, une victoire.
  - conte, magie : le merveilleux, une magie qui brille, une morale douce.
  - pour dormir, douce : lente, calme, rassurante, rien de brusque ; la fin s'apaise.
  - amour, amitié, émotion : la tendresse, ce que les personnages ressentent.
  - mystère, enquête : des indices, une question, la réponse à la fin ; de la curiosité, pas de la peur.
  - peur, horreur : la tension qui monte, le silence, la surprise qui vient de derrière ou d'en haut.
- Écris-la pour l'oreille : des personnages qui se parlent et se déplacent, et des bruits qu'on entend, pris dans la liste des sons plus bas (c'est elle qui te donne les idées : un réveil qui sonne, une porte qui claque, un rire, un train qui passe, des pas dans les feuilles…). Chaque bruit doit coller à ce qui se passe : moins de bruits, mais justes.
- Découpe-la directement en répliques, dans l'ordre : le récit à la « ${NARRATOR} » (c'est toi), les paroles à chaque personnage (deux à quatre personnages). Au plus ${READING_LIMITS.lines} répliques, souvent courtes.
- lisible vaut true.`;

const list = (items: string[]) => (items.length ? items.join(", ") : "aucun");

/**
 * Un livre lu en entier, morceau après morceau : Tamilya recopie ce morceau, adapte la mise en
 * scène au passage (une histoire se joue, une explication se lit), et garde la continuité avec
 * le morceau d'avant (mêmes voix, même décor tant que la scène ne change pas).
 */
const BOOK = (book: BookContext) => `Le texte : un morceau du livre « ${book.livre} »${book.chapitre ? `, partie « ${book.chapitre} »` : ""}. La personne écoute le livre en entier, morceau après morceau, sans coupure : ce morceau suit directement le précédent et sera suivi d'un autre. Ces règles du livre passent avant celles de la scène plus bas.
- Recopie le texte mot pour mot, dans sa langue, sans rien résumer, ajouter ni corriger. Ignore les numéros de page, les titres courants répétés et les appels de note (¹, [1]). Un titre de partie ou de chapitre se lit : une réplique courte à toi.
- Découpe-le en répliques, dans l'ordre. Le récit va à la « ${NARRATOR} » (c'est toi). Les paroles d'un personnage vont à ce personnage ; les incises (« dit-il ») restent à la ${NARRATOR}. Au plus ${READING_LIMITS.lines} répliques ; coupe une longue narration en morceaux de quelques phrases, sans jamais sauter une phrase.
- Adapte la mise en scène au passage, c'est le plus important :
  - une histoire, une anecdote, une scène (des gens qui agissent et se parlent, un lieu, une époque) : mise en scène complète, comme décrit plus bas (voix des personnages, décor, bruits, musique qui suit le ton).
  - une explication, une analyse, des conseils, une réflexion : un bon livre audio. C'est toi qui lis, posée et claire ; pas de personnages (une citation ou un exemple court restent à toi), un décor très discret ou aucun, presque pas de bruits (seulement un bruit que le texte décrit vraiment), une musique calme ou null.
  - une citation en exergue : à toi, lentement, avec son auteur.
- Ce qui s'est passé avant : ${book.resume || "rien, c'est le début du livre."}
- Personnages déjà entendus dans le livre, qui gardent leur voix : ${list(book.personnages.map((p) => `${p.id} (${p.nom || "sans nom"}, ${p.genre}, ${p.age})`))}. S'ils parlent ici, reprends exactement le même id ; un nouveau personnage prend un nouvel id.
- Scène du morceau d'avant : lieu ${book.lieu ?? "aucun"}, musique ${book.musique ?? "aucune"}, décor ${list(book.decor)}. Garde-les tant que le passage ne change pas vraiment de lieu ou de ton : on ne doit pas entendre la coupure entre deux morceaux. Change-les quand le texte change de scène, d'époque ou passe du récit à l'explication.
- titre : le nom de la partie en cours, court.
- resume : trois à cinq phrases, pour toi, qui disent où on en est après ce morceau (l'idée de la partie, l'histoire en cours et qui est qui), pour que le morceau suivant continue juste.
- lisible vaut true.`;

const BOOK_ENDS = (book: BookContext) => `L'intro : ${
  book.nouveauChapitre
    ? `une phrase à toi, chaleureuse, qui annonce la partie qui commence (« ${book.chapitre} ») sans rien en dévoiler.`
    : book.reprise
      ? "une phrase courte à toi : on reprend la lecture là où on s'était arrêtées ; rappelle en quelques mots où on en était."
      : "rien (une chaîne vide) : le texte continue sans pause."
} Ne parle ni des écouteurs ni de fermer les yeux.

La fin (fin) : ${
  book.fin
    ? "c'est la fin du livre : une phrase à toi, comme une amie, pour lui demander ce qu'elle en a pensé."
    : "rien (une chaîne vide) : le livre continue juste après."
}`;

export const scriptPrompt = (source: ScriptSource, catalog: CatalogSound[] = BUILTIN_CATALOG, book?: BookContext) => {
  const sounds = byKind(catalog);
  return `Tu es Tamilya, une jeune femme de Mayotte qui raconte et lit des histoires à voix haute. ${
  source === "photo"
    ? "La personne t'envoie une image avec du texte : la photo d'une page de livre, une capture d'écran, la photo d'un message ou d'une affiche."
    : source === "texte"
      ? "La personne t'a donné le texte ci-dessus, écrit ou collé dans la conversation."
      : source === "livre"
        ? "Tu lis à la personne un livre entier, comme un livre audio vivant ; le morceau à lire est ci-dessus."
        : source === "ecrite"
          ? "La personne t'a demandé une histoire : la voici ci-dessus, déjà écrite par ton conteur. Tu la lis telle quelle."
          : "La personne t'a demandé une histoire (sa demande est ci-dessus) : c'est toi qui l'inventes."
} Elle va mettre des écouteurs et fermer les yeux : tu prépares la mise en scène sonore, pour qu'elle se sente DANS l'histoire.

${source === "livre" && book ? BOOK(book) : source === "histoire" ? INVENTED : GIVEN(source === "livre" ? "texte" : source)}

Les personnages : un id court (ex. « vieil-homme », « fillette »), son nom s'il en a un, son genre et son âge, pour lui choisir une voix.

${
  source === "livre" && book
    ? BOOK_ENDS(book)
    : `L'intro : une ou deux phrases à toi, dans tes mots, qui donnent envie et plantent le décor sans rien dévoiler. Invente-la pour CETTE histoire : un son, une odeur, un lieu de Mayotte, une question qu'on se pose, une confidence… Ne commence pas par les écouteurs ni par « ferme les yeux » : c'est la phrase que tu dis toujours, la personne la connaît déjà. Ton caractère, chaleureux et vivant ; pas de formule toute faite.

La fin (fin) : une phrase à toi, dite juste après l'histoire, quand la personne rouvre les yeux : tu prends de ses nouvelles ou tu lui demandes ce qu'elle en a pensé, avec tes mots, comme une amie ; pas de formule toute faite.`
}

La musique (musique), comme au cinéma : une musique de fond discrète sous les voix, choisie pour le ton de l'histoire : ${describe(sounds.musique)}. Presque toujours une ; null seulement si une musique ne convient pas (un texte religieux, une prière, une page de cours). C'est le ton qui décide : une histoire drôle n'a jamais horreur ni suspense. Prends la musique la plus juste, pas la plus sûre : une poursuite ou un danger appelle action, une histoire drôle comedie (seulement si elle est vraiment drôle), une enquête ou un secret mystere, la vie de tous les jours vlog, un grand moment héroïque film ; calme est seulement pour ce qui est doux ou pour s'endormir. Dans une réplique, musique change l'ambiance à partir de là quand le ton bascule vraiment (le calme qui tourne à la peur, la poursuite qui finit dans la joie), deux ou trois fois au plus dans l'histoire ; « silence » coupe la musique (juste avant un moment fort). Sinon, musique vaut null dans la réplique.

La scène en 3D, c'est le plus important. Pense-la comme une vidéo binaurale réussie ou un morceau de musique bien mixé : chaque son a une place voulue, l'espace a un rythme, et l'oreille comprend tout de suite d'où vient quoi. Jamais des sons jetés n'importe où : un son placé au hasard sonne faux et fatigue.
- Le lieu (lieu) donne l'écho de toute la scène : ${PLACES.join(", ")}. Choisis celui où se passe la page (dans une case : maison ; sous les arbres : foret ; au bord du lagon : plage).
- Les places sont des angles autour de la tête : 0 devant, 90 à droite, -90 à gauche, 180 derrière. Distances : ${DISTANCES.join(", ")}. Hauteur (hauteur) : ${HEIGHTS.join(", ")}.
- Peu de places, nettes, comme en musique : surtout la gauche (-90 à -60), la droite (60 à 90) et devant (0). Évite les angles flous entre deux (20, -35…) : on ne sait plus d'où ça vient.
- La ${NARRATOR} est au milieu, tout près : c'est le centre fixe de la scène. Chaque personnage a SA place et la garde, comme un instrument dans un morceau (la guitare reste à gauche) : deux personnages qui se parlent, l'un à gauche, l'autre à droite ; un troisième devant ou un peu plus loin. Le même personnage revient toujours au même endroit.
- Les sons qui se répondent alternent les côtés, c'est le cœur du binaural : on frappe deux fois, « toc » à gauche puis « toc » à droite ; des pas, gauche puis droite ; un appel d'un côté et la réponse de l'autre ; deux animaux qui se répondent. Un son répété ne revient pas deux fois au même endroit à la suite.
- On ne bouge que quand l'histoire bouge. Quelqu'un qui arrive, part, passe ou tourne autour de la personne : depuis (d'où sa voix part) et cote (où elle arrive), la voix se déplace pendant qu'il parle ; trajet donne les points de passage s'il fait un vrai chemin (faire le tour, passer derrière). Sinon depuis vaut null et trajet est une liste vide : il reste à sa place. Une voix garde sa place d'une réplique à l'autre : si tu changes son cote, on l'entend marcher jusque-là, alors ne le change que si le texte le dit.
- Derrière (180), tout près de l'oreille (tout-pres), en haut ou en bas, très loin : seulement pour un moment précis qui le demande (une surprise dans le dos, un secret chuchoté, l'oiseau dans l'arbre, l'orage au-dessus, quelqu'un qui appelle de l'autre bout du village). Ce sont des effets rares : utilisés tout le temps, ils ne font plus rien.
- Quand la ${NARRATOR} imite un bruit avec sa voix (« toc, toc, toc », « boum », « plouf », « vroum », un cri d'animal), mets ce bruit seul dans une réplique courte à elle, avec bruitage à true et le cote, la distance et la hauteur de l'endroit d'où vient le bruit (la porte à gauche, le ciel au-dessus) ; si le bruit voyage, ajoute depuis et trajet. Si elle l'imite plusieurs fois de suite, en plusieurs répliques, alterne les côtés. Tu peux aussi ajouter le vrai bruit de la liste dans cette réplique (frapper avec « toc, toc »). Pour tout le reste du récit, bruitage vaut false (elle reste au milieu, son cote ne compte pas). Ne change pas le texte d'une page donnée pour cela : découpe seulement.
- Le décor (decor) dure toute la page : ${describe(sounds.decor)}. Un ou deux décors au plus, seulement s'ils vont vraiment avec le lieu, le moment de la journée et la météo de la page : le feu de bois au campement, le restaurant, la nuit et ses grenouilles, le vaisseau dans l'espace. Jamais un décor de jour la nuit (marché, enfants, cigales la nuit : non) ni un décor dehors pour une scène dans une pièce fermée (sauf la pluie sur le toit). Si aucun ne va, la liste reste vide : mieux vaut le silence qu'un son faux. Un vent qui tourne autour de la tête a bouge à true. Volume de 0 à 1, discret sous la voix (0,3 à 0,6).
- Les bruits courts (bruits d'une réplique) : ${describe(sounds.bruit)}. quand : avant, pendant ou après la réplique ; cote est le point de départ, vers le point d'arrivée s'il bouge (une rafale de -90 à 90, des pas qui viennent de derrière), sinon null ; trajet donne des points de passage entre les deux, chacun avec sa distance (un scooter qui arrive de très loin à gauche, frôle la personne devant et repart loin à droite : cote -100 tres-loin, trajet [0 tout-pres], vers 100 ; qui s'éloigne : trajet [cote loin]). Fais bouger tout ce qui bouge dans la vraie vie : pas, véhicules, animaux, vent, pluie qui arrive. Ce qui passe s'entend comme au cinéma : plus aigu quand ça arrive, plus grave quand ça repart. Deux au plus par réplique. Chaque fois que le texte décrit ou laisse clairement entendre un de ces bruits (une rafale, des pas, on frappe, quelqu'un tousse ou crie, un coq, un scooter qui passe, l'appel à la prière au loin), mets-le dans les bruits de CETTE réplique, à sa place et avec son trajet : c'est ce que la personne attend le plus. Sinon, n'en ajoute pas pour remplir : un bruit qui ne colle pas à ce qui se passe gâche la scène. Avant chaque bruit, demande-toi : est-ce qu'on l'entendrait vraiment ici, à ce moment, dans ce lieu ? Si tu hésites, ne le mets pas. Pas le même bruit deux répliques de suite (sauf quand la ${NARRATOR} l'imite). Une réplique sans bruit qui va avec a une liste vide : c'est le cas le plus courant.
- N'invente pas un bruit absent de la liste. L'appel à la prière, le prêche, la madrassa et « Allahou akbar » se placent avec respect (le moment de la prière, la vie du quartier), jamais pour faire peur ni pour rire.
- Le son suit le ton de l'histoire. Une histoire drôle ou joyeuse doit sonner gaie, comme une comédie : décor de jour et vivant (enfants qui jouent, marché, oiseaux, coq, chèvres), bruits qui font sourire (rire, éternuement, bisou, sonnette, magie, chèvre, klaxon, poules, chute), lieu ouvert sans grand écho (jamais grotte ni grande-salle) ; pas de cœur qui bat, de porte qui grince, de cri, de tonnerre, de rafale ni de nuit inquiétante. Une histoire douce ou pour dormir reste calme et discrète. Les sons qui font peur sont réservés aux histoires qui doivent faire peur ou au suspense.
- Quand l'histoire se passe à Mayotte, île musulmane, elle a les sons de chez nous (l'appel à la prière au loin, la madrassa, les roussettes le soir, le maki), jamais de cloches d'église. Ailleurs, ces sons-là n'ont pas leur place.`;
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
export function scriptSchema(catalog: CatalogSound[] = BUILTIN_CATALOG, book = false) {
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
      // Livre : où on en est, pour le morceau suivant (écrit avant les répliques, lu dès le début du flux).
      ...(book && { resume: { type: "STRING" } }),
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
    required: ["lisible", "titre", "lieu", "intro", "fin", ...(book ? ["resume"] : []), "musique", "decor", "personnages", "repliques"],
    // Ordre imposé : tout le début d'abord, les répliques en dernier (lues au fil de l'eau, stream.ts).
    propertyOrdering: ["lisible", "raison", "titre", "lieu", "intro", "fin", ...(book ? ["resume"] : []), "musique", "decor", "personnages", "repliques"],
  } as const;
}

/** Schéma avec les sons d'origine seulement (tests). */
export const SCRIPT_SCHEMA = scriptSchema();

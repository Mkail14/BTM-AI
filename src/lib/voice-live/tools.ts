import "server-only";
import { attestationBlock, attestationOwnBlock } from "@/lib/attestation/intent";
import { bargeBlockFor } from "@/lib/barge/intent";
import { btmDevisBlockFor } from "@/lib/btm/intent";
import { addWhenToBlock, parseCodeExamWhen } from "@/lib/code-exam/when";
import { FOOD_CATALOG } from "@/lib/food/catalog";
import { groupBlock } from "@/lib/food/group-block";
import { groupSpec } from "@/lib/food/group-order";
import { detectFoodOrder, foodBlock } from "@/lib/food/intent";
import { blockContent, combinedBlock, type CombinedPart } from "./combined";

/**
 * « Boutons » du vocal en direct (fonctions de la Live API) : Tamilya les
 * actionne en parlant, et l'écran affiche le même tableau qu'à l'écrit
 * (créneaux du code, commande de repas, ticket de barge, devis BTM). Elle
 * peut ensuite le remplir à la place de la personne (boutons *_tableau, exécutés
 * dans le navigateur : lib/voice-live/board.ts). La personne valide au doigt :
 * rien n'est payé ni réservé à la voix.
 */

export type LiveToolName = "reserver_code" | "commander_repas" | "ticket_barge" | "devis_btm" | "attestation_hebergement" | "tableau_combine";

export type LiveAccess = { food: boolean; barge: boolean };

const text = (description: string) => ({ type: "STRING", description });

/** Déclarations envoyées à Gemini à l'ouverture (seulement ce que ce compte peut faire). */
export function liveToolDeclarations(access: LiveAccess) {
  return [
    {
      name: "reserver_code",
      description:
        "Affiche à l'écran les horaires et places libres pour passer l'examen du code de la route à La Poste (Mayotte), pour que la personne réserve. À utiliser seulement quand elle veut voir des créneaux ou réserver.",
      parameters: {
        type: "OBJECT",
        properties: {
          bureau: text("Bureau La Poste visé si la personne en cite un (ex. Mamoudzou), sinon vide."),
          jour: text("Jour ou moment voulu dans ses mots (ex. « demain matin », « lundi »), sinon vide."),
        },
      },
    },
    ...(access.food
      ? [
          {
            name: "commander_repas",
            description: `Ouvre à l'écran la commande de repas (restaurants de Mayotte) dès que la personne veut commander à manger, même si elle ne dit pas encore quoi : appelle-le tout de suite, AVANT toute question. Un nom de restaurant suffit (« je veux commander chez Délices d'Ashi ») : le tableau affiche sa carte, et c'est là qu'elle choisit. Ne demande jamais « tu veux commander quoi ? » avant d'avoir ouvert le tableau. Avec plusieurs articles, le tableau compose le panier : un restaurant s'il a tout, sinon il propose de prendre le reste ailleurs avec le prix du détour. Restaurants : ${FOOD_CATALOG.map((r) => r.name).join(", ")}.`,
            parameters: { type: "OBJECT", properties: { demande: text("Tout ce qu'elle a dit vouloir, dans ses mots (restaurant, plats, boissons, quantités), par ex. « Délices d'Ashi » ou « un tacos merguez et de l'eau ». Rien de précis : « tout ».") }, required: ["demande"] },
          },
        ]
      : []),
    ...(access.barge
      ? [
          {
            name: "ticket_barge",
            description: "Ouvre à l'écran l'achat de tickets de barge (Grande-Terre ↔ Petite-Terre) quand la personne veut en acheter.",
            parameters: { type: "OBJECT", properties: { demande: text("Sa demande dans ses mots (piétons, voiture, nombre).") }, required: ["demande"] },
          },
        ]
      : []),
    {
      name: "devis_btm",
      description: "Ouvre à l'écran le devis BTM (matériaux de construction aux prix de btm.yt) quand la personne veut chiffrer des travaux ou acheter des matériaux.",
      parameters: { type: "OBJECT", properties: { demande: text("Ses travaux ou matériaux, dans ses mots (ex. « un mur de 10 m »).") }, required: ["demande"] },
    },
    {
      name: "attestation_hebergement",
      description:
        "Ouvre à l'écran l'attestation d'hébergement à titre gratuit quand la personne veut la faire, puis remplis-la à sa place. Préviens d'abord en une phrase que ce qu'elle dit passe par le vocal et reste écrit dans la conversation. Si elle dit de mettre ses infos ou son nom (« mets mes infos », « à mon nom »), comprends-le tout de suite : passe mes_infos à vrai, avec son rôle s'il est connu ; sinon le tableau le lui demande, demande-le-lui aussi et touche le bouton. Si elle le dit une fois le tableau ouvert, rappelle ce bouton avec mes_infos. Son côté se remplit alors tout seul avec son compte : relis-le avec lire_tableau, ne redemande jamais ce qui est écrit et ne demande jamais son nom. Sans cette demande, ne mets rien de son compte. Pose une seule question à la fois, seulement sur ce qui manque, et écris chaque réponse avec remplir_tableau. Fais épeler le nom de famille de l'autre personne. Chaque champ a son nom complet (« Nom de l'hébergeant », « Prénom de la personne hébergée »…) : remplis-les tous, un par un, avec ce nom exact. Pour une date, écris le jour, le mois et l'année. Avant de dire que c'est fini, relis le tableau avec lire_tableau : un champ sans « déjà rempli » est encore vide. Quand tout est rempli, relis le nom des deux personnes et l'adresse. Puis touche « Préparer pour signer à la main », lis le rappel de la loi à voix haute, touche « Créer le PDF à imprimer » et enfin le bouton qui l'enregistre. Tu ne signes jamais, tu ne certifies jamais à la place de quelqu'un, et tu n'inventes aucune information : chaque personne signe elle-même à la main.",
      parameters: {
        type: "OBJECT",
        properties: {
          mes_infos: { type: "BOOLEAN", description: "Vrai seulement si elle demande d'y mettre ses infos ou son nom." },
          role: { type: "STRING", enum: ["heberge", "hebergeant"], description: "Son rôle, si elle l'a dit : heberge (elle est hébergée) ou hebergeant (elle héberge)." },
        },
      },
    },
    {
      name: "tableau_combine",
      description:
        "Crée à l'écran UN seul tableau qui réunit plusieurs services demandés ensemble (ex. un tacos et deux tickets de barge). À utiliser dès que la personne veut au moins deux services en même temps, à la place des boutons séparés.",
      parameters: {
        type: "OBJECT",
        properties: {
          parties: {
            type: "ARRAY",
            description: "Les services, dans l'ordre de la demande (4 au plus).",
            items: {
              type: "OBJECT",
              properties: {
                service: { type: "STRING", enum: ["code", "devis", ...(access.food ? ["repas"] : []), ...(access.barge ? ["barge"] : [])], description: "Le service." },
                demande: text("Ce qu'elle veut pour ce service, dans ses mots (plat, nombre de tickets, travaux…)."),
                bureau: text("Pour le code seulement : bureau La Poste voulu, sinon vide."),
                jour: text("Pour le code seulement : jour ou moment voulu, sinon vide."),
              },
              required: ["service"],
            },
          },
        },
        required: ["parties"],
      },
    },
    {
      name: "heure_mayotte",
      description: "Donne le jour et l'heure exacts à Mayotte, maintenant. À utiliser dès que la personne demande l'heure ou le jour.",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "bruit_ambiant",
      description:
        "Écoute le bruit autour de la personne (pas sa voix) : dit s'il y a du bruit, s'il est fort, et ce que c'est (ventilateur, circulation, travaux, cris, pluie, musique…). À utiliser dès qu'elle demande si tu entends du bruit, ce qu'il y a derrière elle ou autour d'elle, ou si elle est dans un endroit bruyant. Tu l'entends quand même bien : ce bruit est filtré de sa voix.",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "infos_mayotte",
      description:
        "Cherche des informations officielles et à jour sur Mayotte : météo, services publics (mairie, CSSM, préfecture, gendarmerie, France services, impôts… avec adresse, téléphone et horaires), communes (codes postaux, habitants), offres d'emploi, actualité. À utiliser avant de répondre à ce genre de question, sans rien inventer.",
      parameters: {
        type: "OBJECT",
        properties: {
          question: text("La question de la personne, dans ses mots, avec la commune si elle l'a dite (ex. « horaires de la mairie de Sada »)."),
        },
        required: ["question"],
      },
    },
    {
      name: "itineraire",
      description:
        "Ouvre la carte du trajet à l'écran : le chemin jusqu'à un lieu de Mayotte, le temps en voiture, en taxi et à pied, et les boutons Google Maps et Waze. À utiliser dès que la personne demande comment aller quelque part, si c'est loin, ou combien de temps il faut (« de chez moi à la CSSM »). Sans départ dit, le trajet part de son adresse enregistrée.",
      parameters: {
        type: "OBJECT",
        properties: {
          vers: text("Le lieu d'arrivée dans ses mots, avec la commune si elle l'a dite (ex. « CSSM », « mairie de Sada », « hôpital de Mamoudzou »)."),
          depuis: text("Le lieu de départ s'il est dit et que ce n'est pas chez elle (ex. « Sada ») ; sinon laisse vide."),
        },
        required: ["vers"],
      },
    },
    {
      name: "videos_youtube",
      description:
        "Montre des vidéos YouTube à l'écran : dès que la personne veut voir, regarder ou écouter quelque chose (vidéos drôles, clips, musique, recette, tutoriel, sport, un artiste), appelle-le tout de suite, sans rien demander ni dire avant : les plus vues s'affichent d'elles-mêmes. Après, une petite phrase à toi, courte et chaque fois différente (ne décris pas les vidéos, ne les lis pas).",
      parameters: {
        type: "OBJECT",
        properties: {
          recherches: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Une à trois recherches YouTube courtes et précises, dans ses mots (ex. « Squeezie vidéos drôles », « Squeezie meilleurs moments »).",
          },
        },
        required: ["recherches"],
      },
    },
    {
      name: "defiler_conversation",
      description: "Fait défiler la discussion à l'écran : tout en haut, tout en bas, jusqu'au dernier tableau, ou jusqu'au message qui contient des mots précis. À utiliser quand la personne veut revoir un passage.",
      parameters: { type: "OBJECT", properties: { vers: text("« haut », « bas », « tableau », ou des mots du message à retrouver (ex. « tacos »).") }, required: ["vers"] },
    },
    {
      name: "autoriser_paiement",
      description: "La personne vient de dire qu'elle t'autorise à payer à sa place, après l'avertissement affiché. Ouvre la saisie de son code.",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "saisir_code",
      description: "Saisit le code de paiement à 4 chiffres que la personne vient de dire. Ne répète jamais ce code.",
      parameters: { type: "OBJECT", properties: { chiffres: text("Les 4 chiffres, sans espace (ex. 4821).") }, required: ["chiffres"] },
    },
    {
      name: "annuler_paiement",
      description: "Annule le paiement en attente (la personne ne veut plus, ou refuse l'avertissement).",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "lire_tableau",
      description: "Relit le tableau affiché à l'écran : son texte, les boutons et les champs disponibles. À utiliser si la personne a touché l'écran, ou pour lui dire ce qui est affiché (prix, horaires).",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "toucher_tableau",
      description: "Touche un bouton du tableau affiché, à la place de la personne (elle le voit bouger) : choisir une ville, un jour, une heure, un restaurant, ajouter un ticket ou un plat. Renvoie le tableau après le toucher. Pour payer ou réserver, seulement si elle te le demande : l'écran affiche alors un avertissement.",
      parameters: { type: "OBJECT", properties: { bouton: text("Le libellé du bouton, exactement comme dans la liste reçue.") }, required: ["bouton"] },
    },
    {
      name: "remplir_tableau",
      description: "Écrit dans un champ du tableau affiché (une liste de choix aussi), avec ce que la personne vient de dire. Renvoie le tableau après.",
      parameters: {
        type: "OBJECT",
        properties: { champ: text("Le libellé du champ, exactement comme dans la liste reçue."), valeur: text("Ce qu'il faut écrire ou choisir.") },
        required: ["champ", "valeur"],
      },
    },
  ];
}

const arg = (args: Record<string, unknown>, key: string) => (typeof args[key] === "string" ? (args[key] as string).trim().slice(0, 300) : "");

/** Bloc à afficher pour un bouton actionné (null : bouton inconnu ou non autorisé pour ce compte). */
export function liveToolBlock(name: string, args: Record<string, unknown>, access: LiveAccess): string | null {
  switch (name) {
    case "reserver_code": {
      const block = `\`\`\`creneaux-code\n${arg(args, "bureau")}\n\`\`\``;
      return addWhenToBlock(block, parseCodeExamWhen(arg(args, "jour")));
    }
    case "commander_repas": {
      if (!access.food) return null;
      // Rien de précis : tous les restaurants, plutôt qu'un tableau vide.
      const demande = arg(args, "demande") || "tout";
      const spec = groupSpec(demande);
      return (spec ? groupBlock(spec) : foodBlock(detectFoodOrder(demande, [], FOOD_CATALOG) ?? demande)).trim();
    }
    case "ticket_barge":
      return access.barge ? bargeBlockFor(arg(args, "demande") || "ticket de barge").trim() : null;
    case "devis_btm":
      return btmDevisBlockFor(arg(args, "demande") || "devis").trim();
    case "attestation_hebergement":
      if (args.mes_infos !== true) return attestationBlock.trim();
      return attestationOwnBlock(args.role === "heberge" || args.role === "hebergeant" ? args.role : null);
    case "tableau_combine": {
      const tools: Record<string, string> = { repas: "commander_repas", barge: "ticket_barge", code: "reserver_code", devis: "devis_btm" };
      const parties = Array.isArray(args.parties) ? args.parties.slice(0, 4) : [];
      const parts = parties.flatMap((part) => {
        const values = (part && typeof part === "object" ? part : {}) as Record<string, unknown>;
        const tool = tools[arg(values, "service")];
        const block = tool ? liveToolBlock(tool, values, access) : null;
        const content = block ? blockContent(block) : null;
        return content ? [content] : ([] as CombinedPart[]);
      });
      return parts.length ? combinedBlock(parts) : null;
    }
    default:
      return null;
  }
}

import "server-only";
import { bargeBlockFor } from "@/lib/barge/intent";
import { btmDevisBlockFor } from "@/lib/btm/intent";
import { addWhenToBlock, parseCodeExamWhen } from "@/lib/code-exam/when";
import { FOOD_CATALOG } from "@/lib/food/catalog";
import { detectFoodOrder, foodBlock } from "@/lib/food/intent";

/**
 * « Boutons » du vocal en direct (fonctions de la Live API) : Tamilya les
 * actionne en parlant, et l'écran affiche le même tableau qu'à l'écrit
 * (créneaux du code, commande de repas, ticket de barge, devis BTM). La
 * personne valide ensuite au doigt : rien n'est payé ni réservé à la voix.
 */

export type LiveToolName = "reserver_code" | "commander_repas" | "ticket_barge" | "devis_btm";

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
            description: "Ouvre à l'écran la commande de repas (restaurants de Mayotte) quand la personne veut commander à manger.",
            parameters: { type: "OBJECT", properties: { demande: text("Ce qu'elle veut, dans ses mots (restaurant, plat, quantité).") }, required: ["demande"] },
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
      const demande = arg(args, "demande");
      return foodBlock(detectFoodOrder(demande, [], FOOD_CATALOG) ?? demande).trim();
    }
    case "ticket_barge":
      return access.barge ? bargeBlockFor(arg(args, "demande") || "ticket de barge").trim() : null;
    case "devis_btm":
      return btmDevisBlockFor(arg(args, "demande") || "devis").trim();
    default:
      return null;
  }
}

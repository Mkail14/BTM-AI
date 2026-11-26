/**
 * Conversation d'exemple de la page d'accueil, écrite en français. Tamilya la
 * traduit elle-même en shimaoré avec son vocabulaire (src/server/services/site/landing-demo.ts) :
 * quand on la corrige dans une conversation, l'accueil suit tout seul.
 * Changer ces phrases fait retraduire la conversation.
 * Elle tourne en boucle (ChatDemo) : la dernière réplique de Tamilya invite à
 * reposer une question, et la conversation repart du début.
 */
export const DEMO_SCRIPT = [
  { from: "user", fr: "Tu connais Mamoudzou ?" },
  { from: "tamilya", fr: "Oui ! C'est la capitale de Mayotte." },
  { from: "user", fr: "Tu sais ce qu'il y a à Mamoudzou ?" },
  { from: "tamilya", fr: "Il y a la barge, BFC, le Comité et plein d'autres choses !" },
  { from: "user", fr: "Le taxi de Trévani jusqu'à Mamoudzou, c'est combien ?" },
  { from: "tamilya", fr: "C'est 3 euros en taxi." },
  { from: "user", fr: "Et pour aller à Petite-Terre ?" },
  { from: "tamilya", fr: "Tu prends la barge depuis Grand Terre." },
  { from: "user", fr: "Merci beaucoup Tamilya !" },
  { from: "tamilya", fr: "De rien ! Demande-moi encore, je suis là." },
] as const;

export type DemoLine = { from: "user" | "tamilya"; fr: string; shimaore: string | null };

/**
 * Le message parle de la page d'accueil, même mal écrit : « dacceuil », « acueil »,
 * « page d'entrée » (le 2026-11-26, « la page dacceuil » n'était pas reconnu).
 */
export function mentionsLanding(text: string): boolean {
  return /ac+(?:ue|eu|u|e)i?l|page\s+d.?entr/i.test(text);
}

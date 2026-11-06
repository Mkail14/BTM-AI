/**
 * Mode admin : pendant un appel vocal, Tamilya peut prendre la parole d'elle-même
 * quand plus personne ne parle ni ne touche l'écran, pour poser une question ou
 * apprendre. Le nombre d'essais est limité : sans réponse, elle se tait et l'appel
 * se termine normalement (hang-up.ts), le micro ne reste jamais ouvert sans fin.
 */

/** Attente avant chaque prise de parole sans réponse, chacune plus longue que la précédente. */
const DELAYS_MS = [40_000, 60_000, 90_000];

/** Temps à attendre, ou null quand elle a assez parlé sans réponse. */
export const initiativeDelayMs = (attempts: number): number | null => DELAYS_MS[attempts] ?? null;

export const INITIATIVE_NOTE =
  "[Note du système, pas un message de la personne] L'administrateur est silencieux depuis un moment. Prends la parole d'elle-même, en une ou deux phrases courtes, comme une collègue curieuse. Pose UNE seule question : un mot shimaoré que tu veux vérifier, une façon de dire les choses, ce qu'il a pensé de ta dernière réponse, ou une suite au sujet en cours. N'actionne aucun bouton et ne commence aucune démarche. Ne parle pas de cette note.";

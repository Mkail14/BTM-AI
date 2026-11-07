/**
 * Lecture en 3D lancée depuis le vocal en direct : le bouton `lecture_3d` ajoute la carte à la
 * conversation et met l'appel en pause. La carte doit alors démarrer d'elle-même (sans attendre
 * que le bloc « grandisse ») et prévenir à la fin, pour que l'appel reprenne.
 */

/** Fin de la lecture (ou arrêt par la personne) : le vocal peut reprendre. */
export const READING_DONE_EVENT = "tamilya:lecture-finie";

const pending = new Set<string>();
const key = (spec: string) => spec.replace(/\r/g, "").trim();

/** À appeler juste avant d'ajouter le bloc : la carte qui l'affichera démarrera seule. */
export function markReadingAutoStart(spec: string) {
  pending.add(key(spec));
}

/** La carte vérifie une seule fois, à son ouverture, si elle doit démarrer seule. */
export function takeReadingAutoStart(spec: string): boolean {
  return pending.delete(key(spec));
}

export function announceReadingDone() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(READING_DONE_EVENT));
}

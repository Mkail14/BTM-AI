/**
 * Délais du verrou de l'espace admin, en minutes (0 = jamais). Partagé entre
 * le serveur (src/server/services/admin/gate.ts) et l'écran (Mon compte, Sécurité).
 */
export const ADMIN_IDLE_CHOICES = [5, 15, 30, 60, 240, 0] as const;

/** « 5 minutes », « 1 heure », « 4 heures », « jamais ». */
export function idleLabel(minutes: number): string {
  if (minutes <= 0) return "jamais";
  if (minutes % 60 === 0) return minutes === 60 ? "1 heure" : `${minutes / 60} heures`;
  return `${minutes} minutes`;
}

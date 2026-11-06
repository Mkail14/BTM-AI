const clock = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Indian/Mayotte" });

/** Jour et heure exacts à Mayotte, lus sur l'horloge du serveur (ex. « vendredi 6 novembre 2026 à 15:42 »). */
export function mayotteClock(now: Date = new Date()): string {
  return clock.format(now);
}

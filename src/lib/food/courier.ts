import { randomInt } from "node:crypto";

/** Livreur d'une commande : prénom affiché et numéro à appeler. */
export type Courier = { name: string; phone: string };

const DEMO_NAMES = ["Ali", "Fahad", "Nassim", "Ibrahim", "Soifiat", "Anli", "Mouhamadi", "Zaïna"];

/**
 * Livreur de la démonstration. Son numéro est pris dans la plage que l'ARCEP
 * réserve à la fiction (06 39 98 00 00 à 06 39 98 99 99) : appeler ne joint
 * jamais personne. Avec un vrai partenaire, c'est lui qui donne son livreur.
 */
export function demoCourier(): Courier {
  const digits = String(randomInt(0, 10_000)).padStart(4, "0");
  return { name: DEMO_NAMES[randomInt(DEMO_NAMES.length)], phone: `063998${digits}` };
}

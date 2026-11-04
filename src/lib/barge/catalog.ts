/**
 * Tickets de barge (Grande-Terre ↔ Petite-Terre). On ne paie qu'au départ de
 * Mamoudzou : le retour depuis Dzaoudzi (Petite-Terre) est gratuit.
 * Un ticket est valable toute la journée choisie.
 */

import { DEMO_PAYMENTS } from "@/lib/wallet/demo-mode";

/** Démonstration : rien n'est vendu pour de vrai, le solde fictif est débité (interrupteur commun : src/lib/wallet/demo-mode.ts). */
export const BARGE_DEMO = DEMO_PAYMENTS;

export const BARGE_ROUTE = { from: "Mamoudzou", fromSide: "Grande-Terre", to: "Dzaoudzi", toSide: "Petite-Terre" } as const;

export type BargeTicketType = {
  id: string;
  label: string;
  detail: string;
  emoji: string;
  priceCents: number;
  group: "Piétons" | "Deux-roues" | "Véhicules" | "Poids lourds";
};

/** Tarifs de la traversée, par ticket. */
export const BARGE_TICKETS: readonly BargeTicketType[] = [
  { id: "pieton", label: "Piéton", detail: "Ticket unitaire", emoji: "🚶", priceCents: 100, group: "Piétons" },
  { id: "velo", label: "Vélo ou cyclomoteur", detail: "Moins de 125 cm³", emoji: "🛵", priceCents: 200, group: "Deux-roues" },
  { id: "moto", label: "Moto", detail: "Plus de 125 cm³", emoji: "🏍️", priceCents: 300, group: "Deux-roues" },
  { id: "voiture", label: "Voiture", detail: "Véhicule léger", emoji: "🚗", priceCents: 1500, group: "Véhicules" },
  { id: "utilitaire", label: "Utilitaire", detail: "Moins de 3,5 t", emoji: "🚐", priceCents: 3000, group: "Véhicules" },
  { id: "pl-15", label: "Poids lourd", detail: "3,5 t à 15 t", emoji: "🚚", priceCents: 7500, group: "Poids lourds" },
  { id: "pl-26", label: "Poids lourd", detail: "15 t à 26 t", emoji: "🚛", priceCents: 10_000, group: "Poids lourds" },
  { id: "pl-max", label: "Poids lourd", detail: "Plus de 26 t", emoji: "🚛", priceCents: 12_200, group: "Poids lourds" },
];

export const BARGE_MAX_QUANTITY = 20;
/** Jours proposés à l'achat : aujourd'hui et les suivants. */
export const BARGE_DAYS_AHEAD = 7;

export type BargeCartLine = { ticketId: string; quantity: number };

/** Date du jour à Mayotte (UTC+3), « AAAA-MM-JJ ». */
export const mayotteDay = (offsetDays = 0) =>
  new Date(Date.now() + 3 * 3_600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10);

/** Jours achetables, du jour même à BARGE_DAYS_AHEAD jours plus tard. */
export const bargeDays = () => Array.from({ length: BARGE_DAYS_AHEAD + 1 }, (_, i) => mayotteDay(i));

/** Prix calculé à partir du catalogue (jamais celui envoyé par le navigateur). null si un ticket n'existe pas. */
export function priceBargeOrder(cart: readonly BargeCartLine[]) {
  // Un même ticket envoyé sur plusieurs lignes est additionné avant de vérifier la quantité maximale.
  const merged = new Map<string, number>();
  for (const line of cart) {
    if (!Number.isInteger(line.quantity)) return null;
    if (line.quantity <= 0) continue;
    merged.set(line.ticketId, (merged.get(line.ticketId) ?? 0) + line.quantity);
  }
  const lines: { ticket: BargeTicketType; quantity: number }[] = [];
  for (const [ticketId, quantity] of merged) {
    const ticket = BARGE_TICKETS.find((t) => t.id === ticketId);
    if (!ticket || quantity > BARGE_MAX_QUANTITY) return null;
    lines.push({ ticket, quantity });
  }
  if (lines.length === 0) return null;
  const totalCents = lines.reduce((sum, l) => sum + l.ticket.priceCents * l.quantity, 0);
  return { lines, totalCents };
}

/** « 2× Piéton, 1× Voiture » */
export const describeBargeLines = (lines: readonly { label: string; detail?: string; quantity: number }[]) =>
  lines.map((l) => `${l.quantity}× ${l.label}${l.detail && l.label === "Poids lourd" ? ` (${l.detail})` : ""}`).join(", ");

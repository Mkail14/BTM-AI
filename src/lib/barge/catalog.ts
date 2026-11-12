/**
 * Tickets de barge (Grande-Terre ↔ Petite-Terre). On ne paie qu'au départ de
 * Mamoudzou : le retour depuis Dzaoudzi (Petite-Terre) est gratuit.
 * Un ticket n'a pas de date : il reste valable jusqu'à son scan à Mamoudzou, une seule fois.
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

export type BargeCartLine = { ticketId: string; quantity: number };

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

export type BargePassKind = "pieton" | "deux-roues" | "voiture" | "utilitaire" | "camion";

/** Un ticket à montrer à l'embarquement, avec son propre QR code. */
export type BargePass = { code: string; kind: BargePassKind; people: number; title: string };

const PASS_KIND: Record<string, BargePassKind> = {
  pieton: "pieton",
  velo: "deux-roues",
  moto: "deux-roues",
  voiture: "voiture",
  utilitaire: "utilitaire",
  "pl-15": "camion",
  "pl-26": "camion",
  "pl-max": "camion",
};

/** Texte imprimé sur le ticket : « BARGE SEULE », « BARGE À 5 », « 2 ROUES », « VOITURE »… */
export function bargePassTitle(kind: BargePassKind, people = 1): string {
  if (kind === "pieton") return people > 1 ? `BARGE À ${people}` : "BARGE SEULE";
  return { "deux-roues": "2 ROUES", voiture: "VOITURE", utilitaire: "UTILITAIRE", camion: "CAMION" }[kind];
}

/**
 * Découpe un achat en tickets, sans mélange : tous les piétons ensemble sur un
 * seul ticket, et un ticket par véhicule (deux voitures = deux tickets).
 * Chaque ticket reçoit un code différent.
 */
export function splitBargePasses(lines: readonly BargeCartLine[], newCode: () => string): BargePass[] {
  const used = new Set<string>();
  const code = () => {
    let c = newCode();
    for (let i = 0; used.has(c) && i < 20; i++) c = newCode();
    used.add(c);
    return c;
  };
  const people = lines.filter((l) => PASS_KIND[l.ticketId] === "pieton").reduce((n, l) => n + l.quantity, 0);
  const passes: BargePass[] = people > 0 ? [{ code: code(), kind: "pieton", people, title: bargePassTitle("pieton", people) }] : [];
  for (const line of lines) {
    const kind = PASS_KIND[line.ticketId];
    if (!kind || kind === "pieton") continue;
    for (let i = 0; i < line.quantity; i++) passes.push({ code: code(), kind, people: 1, title: bargePassTitle(kind) });
  }
  return passes;
}

/** Identifiant du ticket à partir de son nom (billets gardés avant l'ajout des identifiants). */
export const bargeTicketIdOf = (label: string, detail: string) =>
  BARGE_TICKETS.find((t) => t.label === label && t.detail === detail)?.id ?? BARGE_TICKETS.find((t) => t.label === label)?.id ?? "pieton";

/** « 2× Piéton, 1× Voiture » */
export const describeBargeLines = (lines: readonly { label: string; detail?: string; quantity: number }[]) =>
  lines.map((l) => `${l.quantity}× ${l.label}${l.detail && l.label === "Poids lourd" ? ` (${l.detail})` : ""}`).join(", ");

"use client";

import { parseCombined, type CombinedKind } from "@/lib/voice-live/combined";
import { BargeTickets } from "./BargeTickets";
import { BtmDevis } from "./BtmDevis";
import { CodeExamSlots } from "./CodeExamSlots";
import { FoodOrder } from "./FoodOrder";

const TITLES: Record<CombinedKind, string> = {
  "commande-repas": "Repas",
  "commande-groupee": "Repas",
  "ticket-barge": "Barge",
  "creneaux-code": "Code de la route",
  "devis-btm": "Devis BTM",
};

/**
 * Tableau combiné (bloc ```tableau-combine```) : les services demandés ensemble,
 * l'un sous l'autre, dans un seul tableau. Chaque partie garde son propre
 * paiement (un repas et un billet de barge ne passent pas par le même service) :
 * avec une seule autorisation, Tamilya les paie l'un après l'autre.
 */
export function CombinedBoard({ text }: { text: string }) {
  const parts = parseCombined(text);
  if (!parts.length) return <p className="text-sm text-fg-muted">Ce tableau n&apos;a pas pu s&apos;afficher.</p>;
  return (
    <section aria-label="Ta commande en un tableau" className="w-full max-w-md space-y-3 rounded-3xl border border-border bg-bg-subtle p-2 text-sm leading-normal shadow-sm">
      <div className="px-2 pt-1">
        <p className="font-semibold">Ta commande en un tableau</p>
        <p className="text-xs text-fg-muted">{parts.map((part, index) => `${index + 1}. ${TITLES[part.kind]}`).join(" · ")}</p>
      </div>
      {parts.map((part, index) => (
        <div key={`${index}-${part.kind}`} className="space-y-1">
          <p className="px-2 text-xs font-semibold tracking-wider text-fg-muted uppercase">
            {index + 1}. {TITLES[part.kind]}
          </p>
          {part.kind === "commande-repas" ? (
            <FoodOrder query={part.spec} />
          ) : part.kind === "commande-groupee" ? (
            <FoodOrder query={part.spec} group />
          ) : part.kind === "ticket-barge" ? (
            <BargeTickets query={part.spec} />
          ) : part.kind === "creneaux-code" ? (
            <CodeExamSlots office={part.spec} />
          ) : (
            <BtmDevis query={part.spec} />
          )}
        </div>
      ))}
    </section>
  );
}

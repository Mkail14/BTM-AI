"use client";

import { useEffect, useState } from "react";
import { formatEuros } from "@/lib/wallet/limits";
import { OrderTicket } from "./OrderTicket";

const PERSONA = "var(--persona,var(--accent))";
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

/** Commande payée, gardée sur l'appareil pour retrouver le suivi après un rechargement. */
export type PlacedOrder = {
  code: string;
  restaurant: string;
  emoji: string;
  commune: string;
  lines: string[];
  totalCents: number;
  demo: boolean;
  placedAt: string;
  readyAt: string;
  arrivesAt: string;
};

const STEPS = [
  { label: "En préparation", emoji: "🍳" },
  { label: "En livraison", emoji: "🛵" },
  { label: "Code prêt", emoji: "✅" },
] as const;

/** « dans 3 min », « dans 40 s ». */
function remaining(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return s >= 60 ? `dans ${Math.ceil(s / 60)} min` : `dans ${s} s`;
}

/**
 * Suivi en direct d'une commande, dans la conversation : barre de progression
 * en trois étapes (préparation, livraison, code prêt), heure d'arrivée, puis
 * le QR code à montrer au livreur.
 */
export function OrderTracker({ order }: { order: PlacedOrder }) {
  const [now, setNow] = useState(() => Date.now());
  const placed = Date.parse(order.placedAt);
  const ready = Date.parse(order.readyAt);
  const arrives = Date.parse(order.arrivesAt);
  const phase = now < ready ? 0 : now < arrives ? 1 : 2;

  useEffect(() => {
    if (phase === 2) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  // Avancement de la barre : moitié pour la préparation, moitié pour la livraison.
  const within = (from: number, to: number) => Math.min(1, Math.max(0, (now - from) / Math.max(1, to - from)));
  const progress = phase === 2 ? 1 : phase === 0 ? within(placed, ready) * 0.5 : 0.5 + within(ready, arrives) * 0.5;

  const title =
    phase === 0
      ? `${order.restaurant} prépare ta commande`
      : phase === 1
        ? "Ton livreur est en route"
        : "Ton livreur est arrivé : montre ton code";

  return (
    <div className="booking-step p-4" aria-live="polite">
      <div className="flex items-start gap-3">
        <span key={phase} className="booking-pop grid size-11 shrink-0 place-items-center rounded-2xl bg-bg-subtle text-2xl" aria-hidden="true">
          {STEPS[phase].emoji}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="text-xs text-fg-muted">
            {phase === 2
              ? `Livré à ${order.commune}`
              : `Arrivée vers ${time.format(new Date(arrives))} · ${remaining(arrives - now)} · ${order.commune}`}
          </p>
        </div>
        {order.demo ? (
          <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">Démo</span>
        ) : null}
      </div>

      {/* Barre de progression en trois étapes */}
      <div className="mt-5 px-2">
        <div className="relative h-1.5 rounded-full bg-bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-linear"
            style={{ width: `${progress * 100}%`, background: PERSONA }}
          />
          {STEPS.map((step, i) => (
            <span
              key={step.label}
              aria-hidden="true"
              className={`absolute top-1/2 grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 text-[10px] font-bold transition-colors ${
                i <= phase ? "border-transparent text-white" : "border-border bg-bg text-fg-muted"
              } ${i === phase && phase < 2 ? "animate-pulse" : ""}`}
              style={{ left: `${i * 50}%`, ...(i <= phase ? { background: PERSONA } : {}) }}
            >
              {i < phase ? "✓" : i + 1}
            </span>
          ))}
        </div>
        <ol className="mt-3 grid grid-cols-3 text-[11px]">
          {STEPS.map((step, i) => (
            <li
              key={step.label}
              className={`${i === 0 ? "-ml-2 text-left" : i === 1 ? "text-center" : "-mr-2 text-right"} ${
                i <= phase ? "font-semibold text-fg" : "text-fg-muted"
              }`}
            >
              {step.label}
            </li>
          ))}
        </ol>
      </div>

      {phase === 2 ? (
        <OrderTicket code={order.code} summary={`${order.restaurant} · ${formatEuros(order.totalCents)}`} />
      ) : (
        <p className="mt-4 rounded-xl bg-bg-subtle px-3 py-2 text-center text-xs text-fg-muted">
          Ton code <span className="font-mono font-semibold tracking-wider text-fg">{order.code}</span> et son QR code s&apos;affichent ici à
          l&apos;arrivée du livreur.
        </p>
      )}

      <details className="mt-3 text-xs text-fg-muted">
        <summary className="cursor-pointer select-none">
          {order.emoji} {order.restaurant} · {formatEuros(order.totalCents)} payé avec le portefeuille
        </summary>
        <ul className="mt-1.5 space-y-0.5 pl-4">
          {order.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>
      {order.demo ? <p className="mt-2 text-[11px] text-fg-muted">Démonstration : suivi accéléré, aucun restaurant n&apos;a reçu cette commande.</p> : null}
    </div>
  );
}

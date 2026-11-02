"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BargeResponse, BargeTicketBought } from "@/app/api/barge/route";
import { parseBargeRequest } from "@/lib/barge/intent";
import { blockKey as keyOf, moveBlockValue, readBlockValue } from "@/lib/chat/block-key";
import { formatEuros } from "@/lib/wallet/limits";
import { StyledQr } from "./OrderTicket";

const PERSONA = "var(--persona,var(--accent))";
const TICKET_KEY = "btm-barge-ticket:";

/** Clé d'un bloc : la conversation et le rang du bloc dans la page (chaque bloc garde son billet). */
function blockKey(el: HTMLElement | null) {
  return keyOf(TICKET_KEY, el, "[data-barge-block]");
}

/** Billet acheté depuis ce bloc, gardé sur l'appareil jusqu'au lendemain du jour de validité. */
function savedTicket(key: string): BargeTicketBought | null {
  try {
    const ticket = JSON.parse(readBlockValue(key) ?? "null") as BargeTicketBought | null;
    if (!ticket) return null;
    return Date.parse(`${ticket.day}T23:59:59+03:00`) + 86_400_000 > Date.now() ? ticket : null;
  } catch {
    return null;
  }
}

/** « Aujourd'hui », « Demain », puis « ven. 6 nov. » */
function dayLabel(day: string, index: number) {
  if (index === 0) return "Aujourd'hui";
  if (index === 1) return "Demain";
  return new Date(`${day}T12:00:00+03:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "Indian/Mayotte" });
}

const longDay = (day: string) =>
  new Date(`${day}T12:00:00+03:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Indian/Mayotte" });

function Step({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid size-8 place-items-center rounded-full border border-border bg-bg text-base leading-none transition-colors hover:border-[var(--persona,var(--accent))] hover:text-[var(--persona,var(--accent))] active:scale-90 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Billet payé : QR code à montrer à l'embarquement. */
function BoughtTicket({ ticket }: { ticket: BargeTicketBought }) {
  const count = ticket.lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <div className="booking-step p-4">
      <div className="mx-auto max-w-xs overflow-hidden rounded-2xl border border-border bg-bg-subtle">
        <div className="px-4 pt-4 text-center">
          <p className="text-xs font-semibold tracking-wider text-fg-muted uppercase">Billet de barge{ticket.demo ? " · démo" : ""}</p>
          <p className="mt-1 font-semibold">Mamoudzou → Dzaoudzi</p>
          <p className="text-xs text-fg-muted">Valable le {longDay(ticket.day)}</p>
        </div>
        <div className="mx-auto mt-3 w-48 rounded-xl bg-white p-2">
          <StyledQr text={ticket.code} label={`QR code du billet ${ticket.code}`} />
        </div>
        <p className="mt-2 text-center font-mono text-lg font-bold tracking-widest">{ticket.code}</p>
        {/* Bord prédécoupé du billet. */}
        <div aria-hidden="true" className="relative my-3 border-t border-dashed border-border">
          <span className="absolute -top-2.5 -left-2.5 size-5 rounded-full bg-bg" />
          <span className="absolute -top-2.5 -right-2.5 size-5 rounded-full bg-bg" />
        </div>
        <ul className="space-y-1 px-4 text-sm">
          {ticket.lines.map((l) => (
            <li key={`${l.label}${l.detail}`} className="flex justify-between gap-2">
              <span>
                {l.emoji} {l.quantity}× {l.label}
                {l.label === "Poids lourd" ? <span className="text-fg-muted"> ({l.detail})</span> : null}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex justify-between border-t border-border px-4 py-3 text-sm font-semibold">
          <span>
            {count} ticket{count > 1 ? "s" : ""}
          </span>
          <span className="tabular-nums">{formatEuros(ticket.totalCents)}</span>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-fg-muted">Montre ce QR code à l&apos;embarquement, à Mamoudzou.</p>
    </div>
  );
}

/**
 * Achat de tickets de barge dans la conversation (bloc ```ticket-barge```).
 * Simple : seulement ce que la personne a demandé (par défaut un ticket piéton,
 * « pour moi »), lu dans le bloc (« pieton 2, voiture 1 »). On peut ajouter une
 * personne, ou un autre ticket (véhicule…) si besoin, puis payer en un geste.
 */
export function BargeTickets({ query = "" }: { query?: string }) {
  const root = useRef<HTMLElement>(null);
  const [data, setData] = useState<BargeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [cart, setCart] = useState<Record<string, number>>(() => parseBargeRequest(query));
  const [others, setOthers] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [bought, setBought] = useState<BargeTicketBought | null>(null);
  // Clé du billet acheté : elle suit la conversation quand son adresse change (« / » → /c/<id>).
  const savedKey = useRef<string | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (!savedKey.current) return;
    const next = blockKey(root.current);
    moveBlockValue(savedKey.current, next);
    savedKey.current = next;
  }, [pathname]);

  useEffect(() => {
    const saved = savedTicket(blockKey(root.current));
    if (saved) {
      // Billet déjà acheté depuis ce bloc (après un rechargement).
      setBought(saved);
      return;
    }
    let cancelled = false;
    fetch("/api/barge", { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (BargeResponse & { error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || !body) setError(body?.error ?? "Les tickets de barge sont indisponibles pour le moment.");
        else {
          setData(body);
          setDay(body.days[0] ?? null);
        }
      })
      .catch(() => !cancelled && setError("Connexion impossible : réessaie dans un instant."));
    return () => {
      cancelled = true;
    };
  }, []);

  const lines = useMemo(
    () => (data?.tickets ?? []).filter((t) => cart[t.id]).map((ticket) => ({ ticket, quantity: cart[ticket.id] })),
    [cart, data],
  );
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const totalCents = lines.reduce((sum, l) => sum + l.ticket.priceCents * l.quantity, 0);

  const change = (id: string, delta: number) => {
    setPayError(null);
    setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, (c[id] ?? 0) + delta)) }));
  };

  async function pay() {
    if (!data || !day || count === 0 || paying) return;
    if (totalCents > data.balanceCents) {
      setPayError(`Solde insuffisant : il te manque ${formatEuros(totalCents - data.balanceCents)}.`);
      return;
    }
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch("/api/barge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day, cart: lines.map((l) => ({ ticketId: l.ticket.id, quantity: l.quantity })) }),
      });
      const body = (await res.json().catch(() => null)) as (BargeTicketBought & { error?: string }) | null;
      if (!res.ok || !body?.ok) {
        setPayError(body?.error ?? "Le paiement a échoué. Réessaie.");
        return;
      }
      savedKey.current = blockKey(root.current);
      localStorage.setItem(savedKey.current, JSON.stringify(body));
      setBought(body);
      setCart({});
      // La barre latérale relit le solde.
      window.dispatchEvent(new Event("focus"));
    } catch {
      setPayError("Connexion impossible : vérifie ton réseau.");
    } finally {
      setPaying(false);
    }
  }

  const shell = (children: ReactNode) => (
    <section
      ref={root}
      data-barge-block
      aria-label="Acheter un ticket de barge"
      className="w-full max-w-md overflow-hidden rounded-3xl border border-border bg-bg text-sm leading-normal shadow-sm"
    >
      {children}
    </section>
  );

  if (bought) return shell(<BoughtTicket ticket={bought} />);
  if (error) return shell(<p className="p-4 text-fg-muted">{error}</p>);
  if (!data || !day) {
    return shell(
      <div aria-label="Chargement des tickets" className="space-y-3 p-4">
        <div className="h-10 animate-pulse rounded-xl bg-bg-subtle" />
        <div className="h-14 animate-pulse rounded-xl bg-bg-subtle" />
      </div>,
    );
  }

  const extra = data.tickets.filter((t) => !cart[t.id]);
  return shell(
    <>
      {/* Trajet, en une ligne */}
      <div className="flex items-center gap-3 px-4 pt-4">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-bg-subtle text-xl">
          ⛴️
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {data.route.from} → {data.route.to}
          </p>
          <p className="truncate text-xs text-fg-muted">Retour gratuit · valable toute la journée</p>
        </div>
        {data.demo ? <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">Démo</span> : null}
      </div>

      {/* Jour du voyage */}
      <div className="flex gap-1.5 overflow-x-auto px-4 pt-3 [scrollbar-width:none]" role="radiogroup" aria-label="Jour du voyage">
        {data.days.map((d, i) => {
          const active = d === day;
          return (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setDay(d)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${active ? "border-transparent text-white" : "border-border text-fg-muted hover:text-fg"}`}
              style={active ? { background: PERSONA } : undefined}
            >
              {dayLabel(d, i)}
            </button>
          );
        })}
      </div>

      {/* Tickets demandés, et rien d'autre */}
      <div className="px-4 pt-3">
        {lines.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {lines.map(({ ticket, quantity }) => (
              <li key={ticket.id} className="flex items-center gap-3 px-3 py-2.5">
                <span aria-hidden="true" className="text-xl">
                  {ticket.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">
                    {ticket.label}
                    {ticket.label === "Poids lourd" ? <span className="font-normal text-fg-muted"> ({ticket.detail})</span> : null}
                  </span>
                  <span className="block text-xs text-fg-muted tabular-nums">{formatEuros(ticket.priceCents)} le ticket</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Step label={`Retirer un ticket ${ticket.label}`} onClick={() => change(ticket.id, -1)}>
                    −
                  </Step>
                  <span key={quantity} className="booking-pop w-5 text-center font-semibold tabular-nums">
                    {quantity}
                  </span>
                  <Step label={`Ajouter un ticket ${ticket.label}`} onClick={() => change(ticket.id, 1)} disabled={quantity >= 20}>
                    +
                  </Step>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border border-dashed border-border px-3 py-3 text-center text-xs text-fg-muted">Aucun ticket : ajoute une personne.</p>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <button type="button" onClick={() => change("pieton", 1)} className="font-semibold hover:underline" style={{ color: PERSONA }}>
            + Ajouter une personne
          </button>
          {extra.length ? (
            <button type="button" onClick={() => setOthers((v) => !v)} aria-expanded={others} className="text-fg-muted hover:text-fg">
              {others ? "Fermer" : "Autre ticket (véhicule…)"}
            </button>
          ) : null}
        </div>

        {/* Autres tickets, seulement si on les demande */}
        {others ? (
          <ul className="booking-step mt-2 grid grid-cols-2 gap-1.5">
            {extra.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => {
                    change(ticket.id, 1);
                    setOthers(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl border border-border px-2.5 py-2 text-left transition hover:bg-bg-muted"
                >
                  <span aria-hidden="true">{ticket.emoji}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{ticket.label === "Poids lourd" ? `PL ${ticket.detail}` : ticket.label}</span>
                    <span className="block text-[11px] text-fg-muted tabular-nums">{formatEuros(ticket.priceCents)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Paiement */}
      <div className="p-4 pt-3">
        {payError ? (
          <p role="alert" className="mb-2 text-center text-xs text-danger">
            {payError}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void pay()}
          disabled={count === 0 || paying}
          className="flex w-full items-center justify-between gap-3 rounded-full px-4 py-3 font-medium text-white transition hover:brightness-110 active:scale-[0.99] disabled:opacity-45"
          style={{ background: PERSONA }}
        >
          <span className="truncate">{paying ? "Paiement…" : `Payer · ${count} ticket${count > 1 ? "s" : ""}`}</span>
          <span className="shrink-0 tabular-nums">{formatEuros(totalCents)}</span>
        </button>
        <p className="mt-2 text-center text-[11px] text-fg-muted">
          Payé avec ton portefeuille{data.demo ? " (démo)" : ""} · solde <span className="tabular-nums">{formatEuros(data.balanceCents)}</span>
        </p>
      </div>
    </>,
  );
}

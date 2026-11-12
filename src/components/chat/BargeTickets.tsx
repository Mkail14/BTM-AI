"use client";

import { Pictogram } from "@/components/ui/Pictogram";
import { Ship } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { boardDone } from "@/lib/voice-live/stage";
import type { BargeResponse, BargeTicketBought } from "@/app/api/barge/route";
import { parseBargeRequest } from "@/lib/barge/intent";
import { blockKey as keyOf, moveBlockValue, readBlockValue, saveBlockValue } from "@/lib/chat/block-key";
import { formatEuros } from "@/lib/wallet/limits";
import { PlainQr } from "./OrderTicket";
import { askPayPin } from "@/lib/wallet/pay-pin";

const PERSONA = "var(--persona,var(--accent))";
const TICKET_KEY = "btm-barge-ticket:";

/** Clé d'un bloc : la conversation et le rang du bloc dans la page (chaque bloc garde son billet). */
function blockKey(el: HTMLElement | null) {
  return keyOf(TICKET_KEY, el, "[data-barge-block]");
}

/** Billet acheté depuis ce bloc, gardé sur l'appareil : sans date, il sert jusqu'à son scan. */
function savedTicket(key: string): BargeTicketBought | null {
  try {
    return JSON.parse(readBlockValue(key) ?? "null") as BargeTicketBought | null;
  } catch {
    return null;
  }
}

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

/** Texte imprimé dans le cadre blanc de la carte : « BARGE SEULE » pour un piéton, sinon le véhicule. */
function cardText(lines: BargeTicketBought["lines"]): string[] {
  const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const all = lines.map((l) => {
    const name = l.label === "Piéton" ? "BARGE SEULE" : plain(l.label === "Poids lourd" ? `${l.label} ${l.detail}` : l.label);
    return l.quantity > 1 ? `${name} X${l.quantity}` : name;
  });
  return all.length > 2 ? [all[0], `+ ${all.length - 1} AUTRES`] : all;
}

/** Contour d'hippocampe (tourné vers la droite), dans une boîte 100 × 200. */
const HORSE =
  "M42 14 L44 2 L50 11 L55 3 L58 13 L64 8 L64 19 C74 22 84 28 98 33 C100 36 100 40 97 42 C86 42 76 41 66 45 C72 56 74 70 68 82 C80 94 84 116 76 136 C70 152 58 160 52 170 C48 178 52 190 62 189 C70 188 71 178 63 177 C57 177 56 182 59 184 M52 170 C40 162 30 152 28 142 C20 128 20 110 28 98 C18 86 18 66 30 54 C24 40 28 24 42 14 M68 82 L58 88 M74 100 L62 104 M77 118 L64 120 M74 136 L62 134 M66 150 L56 146 M28 98 L20 94 M28 142 L20 144 M30 54 L22 50";

function Horse({ transform, width }: { transform: string; width: number }) {
  return (
    <g transform={transform}>
      <path d={HORSE} fill="none" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={60} cy={26} r={3} />
    </g>
  );
}

/** Fleur jaune du blason (huit pétales). */
function Flower({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke="#f7d117" strokeWidth={2.4} strokeLinecap="round">
      {[0, 45, 90, 135].map((a) => (
        <line key={a} x1={-9} y1={0} x2={9} y2={0} transform={`rotate(${a})`} />
      ))}
      <circle r={2.6} fill="#f0a500" stroke="none" />
    </g>
  );
}

/** Fond de la carte : bleu, hippocampes, cadres blancs, blason et « DÉPARTEMENT DE MAYOTTE ». */
function CardArt({ text }: { text: string[] }) {
  const id = useId().replace(/:/g, "");
  const scallops = (x0: number, x1: number, y: number) =>
    Array.from({ length: Math.floor((x1 - x0) / 9) + 1 }, (_, i) => <circle key={`${y}-${i}`} cx={x0 + i * 9} cy={y} r={3.6} fill="#fff" />);
  const scallopsV = (x: number, y0: number, y1: number) =>
    Array.from({ length: Math.floor((y1 - y0) / 9) + 1 }, (_, i) => <circle key={`${x}-${i}`} cx={x} cy={y0 + i * 9} r={3.6} fill="#fff" />);
  return (
    <svg viewBox="0 0 540 860" aria-hidden="true" className="absolute inset-0 size-full">
      <defs>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#4fb6ea" />
          <stop offset="100%" stopColor="#2f9ad6" />
        </linearGradient>
        <clipPath id={`${id}-in`}>
          <rect x={22} y={22} width={496} height={816} rx={28} />
        </clipPath>
      </defs>

      {/* Carte blanche et zone bleue */}
      <rect x={1} y={1} width={538} height={858} rx={34} fill="#f3f8fb" stroke="#cfe2ec" strokeWidth={2} />
      <rect x={22} y={22} width={496} height={816} rx={28} fill={`url(#${id}-sea)`} />

      {/* Grands hippocampes clairs sur les bords */}
      <g clipPath={`url(#${id}-in)`} stroke="#bfe6fa" fill="#bfe6fa" opacity={0.75}>
        <Horse transform="translate(-50 40) scale(2.5)" width={2} />
        <Horse transform="translate(590 40) scale(-2.5 2.5)" width={2} />
      </g>

      {/* Cadre du QR code */}
      <rect x={143} y={60} width={254} height={245} fill="#fff" />

      {/* Cadre blanc du texte imprimé */}
      <rect x={104} y={383} width={332} height={72} fill="#fff" opacity={0.95} />
      {text.map((line, i) => {
        const long = line.length * 15.6 > 330;
        return (
          <text
            key={line}
            x={98}
            y={text.length > 1 ? 413 + i * 30 : 418}
            fill="#232323"
            fontSize={26}
            fontWeight={700}
            fontFamily="'Arial Narrow', 'Roboto Condensed', ui-monospace, monospace"
            letterSpacing={0.5}
            textLength={long ? 330 : undefined}
            lengthAdjust="spacingAndGlyphs"
          >
            {line}
          </text>
        );
      })}

      {/* DÉPARTEMENT */}
      <text x={270} y={532} textAnchor="middle" fill="#fff" fontSize={34} fontWeight={800} textLength={252} lengthAdjust="spacingAndGlyphs" fontFamily="ui-sans-serif, system-ui, sans-serif">
        DÉPARTEMENT
      </text>

      {/* Hippocampes qui tiennent le blason */}
      <g stroke="#d9f1fc" fill="#d9f1fc">
        <Horse transform="translate(156 556) scale(0.6 0.68)" width={1.4} />
        <Horse transform="translate(384 556) scale(-0.6 0.68)" width={1.4} />
      </g>

      {/* Blason : bleu au croissant, rouge aux deux fleurs, bord festonné */}
      <rect x={216} y={548} width={108} height={136} rx={3} fill="#fff" />
      <rect x={224} y={556} width={92} height={59} fill="#2b4fb3" />
      <rect x={224} y={615} width={92} height={61} fill="#d7262d" />
      {scallops(224, 316, 556)}
      {scallops(224, 316, 676)}
      {scallopsV(224, 556, 676)}
      {scallopsV(316, 556, 676)}
      <circle cx={270} cy={585} r={16} fill="#fff" />
      <circle cx={270} cy={578} r={14.5} fill="#2b4fb3" />
      <Flower x={252} y={646} />
      <Flower x={288} y={646} />

      {/* Ruban sous le blason */}
      <path d="M204 700 Q270 722 336 700 L342 712 Q270 736 198 712 Z" fill="#fff" stroke="#d9f1fc" strokeWidth={1} />
      <text x={270} y={718} textAnchor="middle" fill="#2f9ad6" fontSize={7} fontWeight={700} letterSpacing={1} fontFamily="ui-sans-serif, system-ui, sans-serif">
        RA HACHIRI
      </text>

      {/* DE (vertical) MAYOTTE */}
      <text transform="translate(147 772) rotate(-90)" textAnchor="middle" fill="#fff" fontSize={25} fontWeight={900} fontFamily="ui-sans-serif, system-ui, sans-serif">
        DE
      </text>
      <text x={160} y={795} fill="#fff" fontSize={68} fontWeight={900} textLength={262} lengthAdjust="spacingAndGlyphs" fontFamily="ui-sans-serif, system-ui, sans-serif">
        MAYOTTE
      </text>

      {/* Trait jaune du bas */}
      <line x1={70} y1={816} x2={470} y2={816} stroke="#dff03c" strokeWidth={5} />
    </svg>
  );
}

/** Billet payé : la carte bleue de la barge, QR code à montrer à l'embarquement. */
function BoughtTicket({ ticket }: { ticket: BargeTicketBought }) {
  const count = ticket.lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <div className="booking-step p-4">
      <div className="relative mx-auto aspect-[540/860] w-full max-w-[260px] drop-shadow-md">
        <CardArt text={cardText(ticket.lines)} />
        <div className="absolute" style={{ left: "30.56%", top: "8.37%", width: "38.89%" }}>
          <PlainQr text={ticket.code} label={`QR code du billet ${ticket.code}`} />
        </div>
      </div>
      <p className="mt-3 text-center font-mono text-sm font-bold tracking-widest">{ticket.code}</p>
      <p className="text-center text-xs text-fg-muted">
        {count} ticket{count > 1 ? "s" : ""} · <span className="tabular-nums">{formatEuros(ticket.totalCents)}</span>
        {ticket.demo ? " · démo" : ""}
      </p>
      <p className="mt-2 text-center text-xs text-fg-muted">Montre ce QR code à l&apos;embarquement, à Mamoudzou. Une fois scanné, il ne sert plus.</p>
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
        else setData(body);
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
    if (!data || count === 0 || paying) return;
    if (totalCents > data.balanceCents) {
      setPayError(`Solde insuffisant : il te manque ${formatEuros(totalCents - data.balanceCents)}.`);
      return;
    }
    // Code de paiement avant chaque paiement (déjà donné si Tamilya paie à la voix).
    if (!(await askPayPin(`Tickets de barge · ${formatEuros(totalCents)}`))) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await fetch("/api/barge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cart: lines.map((l) => ({ ticketId: l.ticket.id, quantity: l.quantity })) }),
      });
      const body = (await res.json().catch(() => null)) as (BargeTicketBought & { error?: string }) | null;
      if (!res.ok || !body?.ok) {
        setPayError(body?.error ?? "Le paiement a échoué. Réessaie.");
        return;
      }
      savedKey.current = blockKey(root.current);
      saveBlockValue(savedKey.current, JSON.stringify(body));
      setBought(body);
      boardDone(root.current);
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
  if (!data) {
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
          <Ship size="1em" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {data.route.from} → {data.route.to}
          </p>
          <p className="truncate text-xs text-fg-muted">Sans date · valable jusqu&apos;au scan</p>
        </div>
        {data.demo ? <span className="shrink-0 rounded-full bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">Démo</span> : null}
      </div>

      {/* Tickets demandés, et rien d'autre */}
      <div className="px-4 pt-3">
        {lines.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {lines.map(({ ticket, quantity }) => (
              <li key={ticket.id} className="flex items-center gap-3 px-3 py-2.5">
                <span aria-hidden="true" className="text-xl">
                  <Pictogram of={ticket.emoji} fallback={Ship} />
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
                  <Pictogram of={ticket.emoji} fallback={Ship} />
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

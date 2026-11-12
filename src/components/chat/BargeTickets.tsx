"use client";

import { Pictogram } from "@/components/ui/Pictogram";
import { Ship } from "lucide-react";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { boardDone } from "@/lib/voice-live/stage";
import type { BargeResponse, BargeTicketBought } from "@/app/api/barge/route";
import { bargeTicketIdOf, splitBargePasses, type BargePass } from "@/lib/barge/catalog";
import { parseBargeRequest } from "@/lib/barge/intent";
import { blockKey as keyOf, moveBlockValue, readBlockValue, saveBlockValue } from "@/lib/chat/block-key";
import { formatEuros } from "@/lib/wallet/limits";
import { PlainQr } from "./OrderTicket";
import { askPayPin } from "@/lib/wallet/pay-pin";

const PERSONA = "var(--persona,var(--accent))";
const TICKET_KEY = "btm-barge-ticket:";
/** Démo : ticket « scanné » (deux touches rapides), gardé sur l'appareil. Le vrai scan viendra du gestionnaire des barges. */
const SCAN_KEY = "btm-barge-scan:";
/** Deux touches à moins de 350 ms : le ticket est scanné. */
const DOUBLE_TAP_MS = 350;
/** Hauteur (en %) où le ticket se déchire, juste sous le cadre blanc. */
const TEAR = 57;

/** Clé d'un bloc : la conversation et le rang du bloc dans la page (chaque bloc garde ses billets). */
function blockKey(el: HTMLElement | null) {
  return keyOf(TICKET_KEY, el, "[data-barge-block]");
}

/** Achats faits depuis ce bloc, gardés sur l'appareil (avant : un seul achat par bloc). */
function savedPurchases(key: string): BargeTicketBought[] {
  try {
    const value = JSON.parse(readBlockValue(key) ?? "null") as BargeTicketBought | BargeTicketBought[] | null;
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  } catch {
    return [];
  }
}

/** Tickets d'un achat. Anciens billets (sans `passes`) : découpés ici, le premier garde le code d'origine. */
function passesOf(purchase: BargeTicketBought): BargePass[] {
  if (purchase.passes?.length) return purchase.passes;
  let n = 0;
  const lines = purchase.lines.map((l) => ({ ticketId: bargeTicketIdOf(l.label, l.detail), quantity: l.quantity }));
  return splitBargePasses(lines, () => (n++ === 0 ? purchase.code : `${purchase.code}-${n}`));
}

function readScan(code: string): string | null {
  try {
    return localStorage.getItem(SCAN_KEY + code);
  } catch {
    return null;
  }
}

function saveScan(code: string, iso: string) {
  try {
    localStorage.setItem(SCAN_KEY + code, iso);
  } catch {
    // Stockage bloqué : le scan vaut pour cette page seulement.
  }
}

const frDate = (d: Date) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

/** Date du jour, remise à jour à minuit si la page reste ouverte. */
function useToday(): string {
  const [today, setToday] = useState(() => frDate(new Date()));
  useEffect(() => {
    const timer = window.setInterval(() => setToday(frDate(new Date())), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return today;
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

/**
 * Fond de la carte, comme la vraie carte de barge :
 * - grands hippocampes repris de la photo de la carte (public/barge/hippocampe.png, côté gauche, retourné à droite) ;
 * - logo officiel du Département (Wikimedia Commons, « Département de Mayotte Logo.svg », CC BY-SA 4.0),
 *   passé en blanc sur le bleu (public/barge/departement-mayotte.svg).
 * Dans le cadre blanc : le ticket (« BARGE SEULE »…) et, dessous, la date.
 */
function CardArt({ title, date }: { title: string; date: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 540 860" aria-hidden="true" className="absolute inset-0 size-full">
      <defs>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#44aee5" />
          <stop offset="100%" stopColor="#3399d7" />
        </linearGradient>
        <clipPath id={`${id}-in`}>
          <rect x={22} y={22} width={496} height={816} rx={28} />
        </clipPath>
      </defs>

      {/* Carte blanche et zone bleue */}
      <rect x={1} y={1} width={538} height={858} rx={34} fill="#f3f8fb" stroke="#cfe2ec" strokeWidth={2} />
      <rect x={22} y={22} width={496} height={816} rx={28} fill={`url(#${id}-sea)`} />

      {/* Grands hippocampes sur les bords */}
      <g clipPath={`url(#${id}-in)`} opacity={0.9}>
        <image href="/barge/hippocampe.png" x={22} y={22} width={248} height={816} preserveAspectRatio="none" />
        <image href="/barge/hippocampe.png" x={22} y={22} width={248} height={816} preserveAspectRatio="none" transform="translate(540 0) scale(-1 1)" />
      </g>

      {/* Cadre du QR code */}
      <rect x={143} y={60} width={254} height={245} fill="#fff" />

      {/* Cadre blanc : le ticket et la date, centrés */}
      <rect x={104} y={383} width={332} height={72} fill="#fff" opacity={0.95} />
      <text
        x={270}
        y={414}
        textAnchor="middle"
        fill="#232323"
        fontSize={27}
        fontWeight={700}
        fontFamily="ui-monospace, 'Roboto Mono', monospace"
        letterSpacing={0.5}
      >
        {title}
      </text>
      <text x={270} y={443} textAnchor="middle" fill="#3a3a3a" fontSize={19} fontWeight={600} fontFamily="ui-monospace, 'Roboto Mono', monospace">
        {date}
      </text>

      {/* Logo du Département : DÉPARTEMENT, blason et hippocampes, RA HACHIRI, DE MAYOTTE */}
      <image href="/barge/departement-mayotte.svg" x={124} y={503} width={292} height={279} />

      {/* Trait jaune du bas */}
      <line x1={70} y1={812} x2={470} y2={812} stroke="#dff03c" strokeWidth={5} />
    </svg>
  );
}

/** Bord déchiré (dents de scie) à la hauteur TEAR. */
const ZIGZAG = Array.from({ length: 21 }, (_, i) => `${i * 5}% ${TEAR + (i % 2 ? 1.2 : -1.2)}%`);
const TOP_PART = `polygon(0 0, 100% 0, ${[...ZIGZAG].reverse().join(", ")})`;
const STUB_PART = `polygon(${ZIGZAG.join(", ")}, 100% 100%, 0 100%)`;

function CardFace({ pass, date }: { pass: BargePass; date: string }) {
  return (
    <>
      <CardArt title={pass.title} date={date} />
      <div className="absolute" style={{ left: "30.56%", top: "8.37%", width: "38.89%" }}>
        <PlainQr text={pass.code} label={`QR code du ticket ${pass.code}`} />
      </div>
    </>
  );
}

/**
 * Le ticket : entier tant qu'il n'est pas scanné (avec la date du jour) ; une fois scanné,
 * le bas est arraché comme un ticket de cinéma, le reste grisé avec « UTILISÉ » et la date du scan.
 * `tearing` : l'arrachage est en train de se jouer.
 */
function PassCard({ pass, scannedAt, tearing }: { pass: BargePass; scannedAt: string | null; tearing?: boolean }) {
  const today = useToday();
  const date = scannedAt ? frDate(new Date(scannedAt)) : today;
  if (!scannedAt) return <CardFace pass={pass} date={date} />;
  const part = (clip: string, extra?: CSSProperties, className?: string) => (
    <div className={`absolute inset-0 ${className ?? ""}`} style={{ clipPath: clip, WebkitClipPath: clip, ...extra }}>
      <CardFace pass={pass} date={date} />
    </div>
  );
  return (
    <>
      {part(TOP_PART, { filter: "grayscale(0.75)", opacity: 0.85 }, tearing ? "barge-tear-top" : undefined)}
      {tearing ? part(STUB_PART, undefined, "barge-tear-stub") : null}
      <span
        className={`absolute top-[24%] left-1/2 rounded-md border-4 border-red-600 bg-white/85 px-3 py-1 text-[min(9cqw,2.4rem)] font-black tracking-widest whitespace-nowrap text-red-600 ${tearing ? "barge-stamp" : "-translate-x-1/2 -rotate-[14deg]"}`}
      >
        UTILISÉ
      </span>
    </>
  );
}

/** Le ticket en grand, au milieu de l'écran ; toucher le flou autour (ou Échap) le ferme. */
function PassFullscreen({
  pass,
  scannedAt,
  tearing,
  onTap,
  onClose,
  onReorder,
}: {
  pass: BargePass;
  scannedAt: string | null;
  tearing: boolean;
  onTap: (at: number) => void;
  onClose: () => void;
  onReorder: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ticket de barge en grand"
      onClick={onClose}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-black/40 p-4 backdrop-blur-md"
    >
      <div
        onClick={(e) => {
          e.stopPropagation();
          onTap(e.timeStamp);
        }}
        className="booking-pop relative overflow-hidden drop-shadow-2xl select-none [container-type:inline-size]"
        style={
          // Ticket usé : le bas arraché n'occupe plus de place, toucher là où il était ferme le ticket.
          scannedAt && !tearing
            ? { aspectRatio: "540 / 510", height: "min(60dvh, calc((100vw - 2rem) * 510 / 540))" }
            : {
                aspectRatio: "540 / 860",
                height: scannedAt ? "min(74dvh, calc((100vw - 2rem) * 860 / 540))" : "min(92dvh, calc((100vw - 2rem) * 860 / 540))",
              }
        }
      >
        <span className="absolute inset-x-0 top-0 block aspect-[540/860] [container-type:inline-size]">
          <PassCard pass={pass} scannedAt={scannedAt} tearing={tearing} />
        </span>
      </div>
      {scannedAt && !tearing ? (
        <div className="booking-step max-w-xs text-center text-white">
          <p className="font-semibold">Ticket utilisé le {frDate(new Date(scannedAt))}</p>
          <p className="mt-1 text-sm text-white/80">Il n&apos;est plus valable. Commande un nouveau ticket pour la prochaine traversée.</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onReorder();
            }}
            className="mt-3 rounded-full px-5 py-2.5 font-medium text-white transition hover:brightness-110 active:scale-[0.98]"
            style={{ background: PERSONA }}
          >
            Commander un nouveau ticket
          </button>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}

/**
 * Tickets payés : un par véhicule, les piétons ensemble. Toucher un ticket l'agrandit ;
 * deux touches rapides le « scannent » (démo) : il se déchire et ne sert plus.
 */
function BoughtTickets({ purchases, onReorder }: { purchases: BargeTicketBought[]; onReorder: () => void }) {
  const passes = useMemo(() => purchases.flatMap(passesOf), [purchases]);
  // Scans gardés sur l'appareil (lus une fois), plus ceux faits sur cette page.
  const stored = useMemo(() => {
    const read: Record<string, string> = {};
    for (const p of passes) {
      const at = readScan(p.code);
      if (at) read[p.code] = at;
    }
    return read;
  }, [passes]);
  const [fresh, setFresh] = useState<Record<string, string>>({});
  const scans = useMemo(() => ({ ...stored, ...fresh }), [stored, fresh]);
  const [open, setOpen] = useState<string | null>(null);
  const [tearing, setTearing] = useState<string | null>(null);
  const lastTap = useRef<{ code: string; at: number } | null>(null);

  const scan = useCallback((code: string) => {
    const at = new Date().toISOString();
    saveScan(code, at);
    setFresh((s) => ({ ...s, [code]: at }));
    setOpen(code);
    setTearing(code);
    try {
      navigator.vibrate?.([30, 50, 80]);
    } catch {
      // Pas de vibreur.
    }
    window.setTimeout(() => setTearing((t) => (t === code ? null : t)), 1200);
  }, []);

  /** Une touche ouvre le ticket en grand ; une deuxième, juste après, le scanne. */
  const tap = (code: string, now: number) => {
    const double = lastTap.current?.code === code && now - lastTap.current.at < DOUBLE_TAP_MS;
    lastTap.current = { code, at: now };
    if (double && !scans[code]) {
      lastTap.current = null;
      scan(code);
    } else setOpen(code);
  };

  const close = useCallback(() => setOpen(null), []);
  const shown = passes.find((p) => p.code === open) ?? null;
  const totalCents = purchases.reduce((n, p) => n + p.totalCents, 0);
  const demo = purchases.some((p) => p.demo);
  const several = passes.length > 1;

  return (
    <div className="booking-step p-4">
      <ul className={`m-0 list-none p-0 ${several ? "grid grid-cols-2 gap-3" : ""}`}>
        {passes.map((pass) => (
          <li key={pass.code} className="m-0 list-none p-0 text-center">
            <button
              type="button"
              onClick={(e) => tap(pass.code, e.timeStamp)}
              aria-label={`Ticket ${pass.title}, ${scans[pass.code] ? "déjà utilisé" : "toucher pour l'agrandir, deux fois pour le scanner"}`}
              style={{ aspectRatio: scans[pass.code] ? "540 / 510" : "540 / 860" }}
              className={`relative mx-auto block w-full cursor-zoom-in overflow-hidden drop-shadow-md transition select-none active:scale-[0.98] [container-type:inline-size] ${several ? "" : "max-w-[260px]"}`}
            >
              {/* Ticket utilisé : le bas arraché ne garde pas sa place vide. */}
              <span className="absolute inset-x-0 top-0 block aspect-[540/860]">
                <PassCard pass={pass} scannedAt={scans[pass.code] ?? null} />
              </span>
            </button>
            <p className="mt-2 font-mono text-xs font-bold tracking-widest">{pass.code}</p>
          </li>
        ))}
      </ul>
      {shown ? (
        <PassFullscreen
          pass={shown}
          scannedAt={scans[shown.code] ?? null}
          tearing={tearing === shown.code}
          onTap={(at) => tap(shown.code, at)}
          onClose={close}
          onReorder={() => {
            setOpen(null);
            onReorder();
          }}
        />
      ) : null}
      <p className="mt-2 text-center text-xs text-fg-muted">
        {passes.length} ticket{several ? "s" : ""} · <span className="tabular-nums">{formatEuros(totalCents)}</span>
        {demo ? " · démo" : ""}
      </p>
      <p className="mt-2 text-center text-xs text-fg-muted">
        Montre le QR code à l&apos;embarquement, à Mamoudzou. Une fois scanné, le ticket ne sert plus.
        {demo ? " Démo : touche deux fois un ticket pour le scanner." : ""}
      </p>
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
  const [bought, setBought] = useState<BargeTicketBought[]>([]);
  const [loaded, setLoaded] = useState(false);
  // « Commander un nouveau ticket » : le formulaire revient sous les tickets déjà achetés.
  const [reorder, setReorder] = useState(false);
  // Clé des billets achetés : elle suit la conversation quand son adresse change (« / » → /c/<id>).
  const savedKey = useRef<string | null>(null);
  const pathname = usePathname();
  useEffect(() => {
    if (!savedKey.current) return;
    const next = blockKey(root.current);
    moveBlockValue(savedKey.current, next);
    savedKey.current = next;
  }, [pathname]);

  useEffect(() => {
    const saved = savedPurchases(blockKey(root.current));
    if (saved.length) {
      // Billets déjà achetés depuis ce bloc (après un rechargement).
      savedKey.current = blockKey(root.current);
      setBought(saved);
    }
    setLoaded(true);
  }, []);

  const needForm = loaded && (bought.length === 0 || reorder);
  useEffect(() => {
    if (!needForm || data) return;
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
  }, [needForm, data]);

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

  const startReorder = () => {
    setCart({ pieton: 1 });
    setOthers(false);
    setPayError(null);
    setReorder(true);
    // Le solde a baissé depuis le dernier achat : relu.
    setData(null);
    window.setTimeout(() => root.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
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
      const next = [...bought, body];
      savedKey.current = blockKey(root.current);
      saveBlockValue(savedKey.current, JSON.stringify(next));
      setBought(next);
      setReorder(false);
      setData(null);
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

  // Tickets seuls (sans formulaire) : pas de cadre autour, ils sont posés sur la conversation.
  const shell = (children: ReactNode, bare = false) => (
    <section
      ref={root}
      data-barge-block
      aria-label="Acheter un ticket de barge"
      className={`w-full max-w-md text-sm leading-normal ${bare ? "" : "overflow-hidden rounded-3xl border border-border bg-bg shadow-sm"}`}
    >
      {children}
    </section>
  );

  const tickets = bought.length ? <BoughtTickets purchases={bought} onReorder={startReorder} /> : null;
  if (!loaded || (bought.length && !reorder)) return shell(tickets, true);
  if (error) return shell(
    <>
      {tickets}
      <p className="p-4 text-fg-muted">{error}</p>
    </>,
  );
  if (!data) {
    return shell(
      <>
        {tickets}
        <div aria-label="Chargement des tickets" className="space-y-3 p-4">
          <div className="h-10 animate-pulse rounded-xl bg-bg-subtle" />
          <div className="h-14 animate-pulse rounded-xl bg-bg-subtle" />
        </div>
      </>,
    );
  }

  const extra = data.tickets.filter((t) => !cart[t.id]);
  return shell(
    <>
      {tickets ? <div className="border-b border-border">{tickets}</div> : null}
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

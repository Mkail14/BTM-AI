"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FLY_MS, flyToBell, notify } from "@/lib/notifications";
import { formatEuros } from "@/lib/wallet/limits";
import type { Courier } from "@/lib/food/courier";
import { dayLabel } from "@/lib/food/schedule";
import { deliveryPoint, positionAt, remainingFrom, restaurantPoint, routeKm, routePath, travelledPart, type Point } from "@/lib/food/route";
import dynamic from "next/dynamic";
import { CourierChat, formatPhone, telLink, useCourierMessageCount } from "./CourierContact";
import { CleanQr, OrderTicket, StyledQr } from "./OrderTicket";
import { useLiveRoute, useRoadRoutes } from "./useLiveRoute";

// Carte du livreur (MapLibre et sa feuille de style) : chargée seulement quand le suivi s'ouvre.
const CourierMap = dynamic(() => import("./CourierMap").then((m) => m.CourierMap), { ssr: false });

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
  /** Livreur (absent des commandes passées avant son ajout). */
  courier?: Courier | null;
  /** Restaurant et lieu de livraison sur la carte (absents des anciennes commandes : placés dans la commune). */
  from?: Point;
  to?: Point;
  /** Clic « J'ai récupéré la commande » du livreur (envoyé par le partenaire ; simulé en démonstration). */
  pickedUpAt?: string;
  /** Adresse écrite et mot laissé, pour « Ma commande ». */
  address?: string;
  note?: string;
  /** Commande programmée : en attente jusqu'à placedAt (début de la préparation). */
  scheduled?: boolean;
};

/** Commandes payées, gardées sur l'appareil : « btm-food-order:<recherche> ». */
export const ORDER_KEY = "btm-food-order:";
/** Prévient la pastille « Ma commande » qu'une commande a été payée ou reçue. */
export const ORDER_EVENT = "btm-food-order";
/** Une commande arrivée et jamais marquée reçue disparaît d'elle-même après ce délai. */
const ARRIVED_KEPT_MS = 20 * 60_000;
/** Démonstration : le livreur simulé récupère la commande quelques secondes après la fin de la préparation. */
const DEMO_PICKUP_DELAY_MS = 8000;

type StoredOrder = PlacedOrder & { receivedAt?: string };

/** Commande en cours la plus récente (pas encore reçue), et sa clé. */
function activeOrder(now = Date.now()): { key: string; order: PlacedOrder } | null {
  let best: { key: string; order: StoredOrder } | null = null;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(ORDER_KEY)) continue;
    try {
      const order = JSON.parse(localStorage.getItem(key) ?? "null") as StoredOrder | null;
      if (!order || order.receivedAt || Date.parse(order.arrivesAt) + ARRIVED_KEPT_MS < now) continue;
      if (!best || order.placedAt > best.order.placedAt) best = { key, order };
    } catch {
      // Valeur illisible : ignorée.
    }
  }
  return best;
}

/** « J'ai reçu ma commande » : la pastille disparaît. */
function markReceived(code: string) {
  let thanked: PlacedOrder | null = null;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(ORDER_KEY)) continue;
    try {
      const order = JSON.parse(localStorage.getItem(key) ?? "null") as StoredOrder | null;
      if (order?.code === code) {
        localStorage.setItem(key, JSON.stringify({ ...order, receivedAt: new Date().toISOString() }));
        thanked = order;
      }
    } catch {
      // Valeur illisible : ignorée.
    }
  }
  window.dispatchEvent(new Event(ORDER_EVENT));
  if (thanked) window.dispatchEvent(new CustomEvent<PlacedOrder>(THANKS_EVENT, { detail: thanked }));
}

/** Commande tout juste reçue : la pastille dit merci avant de partir. */
const THANKS_EVENT = "btm-food-thanks";

/** « 3 min », « 40 s ». */
function remaining(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s >= 3600) {
    const m = Math.ceil(s / 60);
    return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
  }
  return s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`;
}

/**
 * Horloge du suivi : étape en cours (0 préparation, 1 livraison, 2 arrivé) et
 * remplissage des trois parties de l'anneau.
 */
function useOrderClock(order: PlacedOrder) {
  const [now, setNow] = useState(() => Date.now());
  const placed = Date.parse(order.placedAt);
  const ready = Date.parse(order.readyAt);
  const arrives = Date.parse(order.arrivesAt);
  const phase = now < ready ? 0 : now < arrives ? 1 : 2;
  // Moment où le livreur touche « J'ai récupéré la commande » dans son application. En démonstration,
  // un livreur simulé le fait peu après la fin de la préparation ; sinon, le partenaire l'envoie (pickedUpAt).
  const pickup = order.pickedUpAt
    ? Date.parse(order.pickedUpAt)
    : order.demo
      ? Math.min(ready + DEMO_PICKUP_DELAY_MS, arrives - 5000)
      : Number.POSITIVE_INFINITY;

  useEffect(() => {
    if (phase === 2) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  const accepted = now >= pickup;
  // Commande programmée dont la préparation n'a pas encore commencé.
  const waiting = Boolean(order.scheduled) && now < placed;
  // Cloche des notifications : commande passée, livreur parti, livreur arrivé (une fois chacune).
  useEffect(() => {
    const what = `${order.emoji} ${order.restaurant}`;
    if (order.scheduled)
      notify({ id: `${order.code}:scheduled`, emoji: "⏰", title: `Commande programmée chez ${order.restaurant}`, subtitle: `Livraison vers ${time.format(new Date(order.arrivesAt))} · ${order.lines.join(" · ")}`, at: new Date().toISOString() });
    if (!waiting)
      notify({ id: `${order.code}:placed`, emoji: "🧾", title: `${order.restaurant} prépare ta commande`, subtitle: order.lines.join(" · "), at: order.placedAt });
    if (accepted)
      notify({ id: `${order.code}:pickup`, emoji: "🛵", title: `${order.courier?.name ?? "Ton livreur"} a récupéré ta commande`, subtitle: `${what} · en route vers ${order.commune}`, at: new Date(Math.min(pickup, Date.now())).toISOString() });
    if (accepted && phase === 2)
      notify({ id: `${order.code}:arrived`, emoji: "📍", title: "Ton livreur est arrivé", subtitle: `Montre ton code ${order.code}`, at: order.arrivesAt });
  }, [accepted, phase, order, pickup, waiting]);

  const within = (from: number, to: number) => Math.min(1, Math.max(0, (now - from) / Math.max(1, to - from)));
  return {
    now,
    phase,
    placed,
    ready,
    arrives,
    pickup,
    fills: [within(placed, ready), within(pickup, arrives), phase === 2 ? 1 : 0] as const,
    // Le code et le QR code n'apparaissent qu'après le clic du livreur : il a bien la commande en main.
    accepted,
    waiting,
  };
}

/** Scooter de livraison, dessiné au trait (prend la couleur du texte). */
function Scooter({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <circle cx="14" cy="36" r="7" />
      <circle cx="50" cy="36" r="7" />
      <path d="M21 36h16l6-14h-9" />
      <path d="M43 22l7 14" />
      <path d="M38 12h7l-2 10" />
      <rect x="6" y="14" width="16" height="12" rx="2.5" fill="currentColor" fillOpacity="0.15" />
      <path d="M6 26h20l4 6" />
    </svg>
  );
}

/**
 * Anneau en trois parties autour du scooter : préparation, trajet, arrivée.
 * Chaque partie se remplit à son tour.
 */
function ProgressRing({ fills, phase, size }: { fills: readonly number[]; phase: number; size: number | string }) {
  const r = 44;
  const gap = 8;
  const part = 120 - gap;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        {fills.map((fill, i) => {
          const offset = -(i * 120 + gap / 2);
          return (
            <g key={i}>
              <circle cx="50" cy="50" r={r} pathLength={360} fill="none" strokeWidth="6" strokeLinecap="round" className="stroke-bg-muted" strokeDasharray={`${part} 360`} strokeDashoffset={offset} />
              <circle
                cx="50"
                cy="50"
                r={r}
                pathLength={360}
                fill="none"
                strokeWidth="6"
                strokeLinecap="round"
                stroke={PERSONA}
                strokeDasharray={`${fill > 0 ? Math.max(0.01, part * fill) : 0} 360`}
                strokeDashoffset={offset}
                className="transition-[stroke-dasharray] duration-1000 ease-linear"
              />
            </g>
          );
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center" style={{ color: PERSONA }}>
        <Scooter className={`w-[46%] ${phase === 1 ? "order-scooter-ride" : phase === 2 ? "order-scooter-park" : ""}`} />
      </div>
    </div>
  );
}

const titleOf = (phase: number, restaurant: string, pickedUp = true, waiting = false) =>
  waiting ? "Commande programmée" : phase === 0 ?`${restaurant} prépare ta commande` : phase === 1 ? (pickedUp ? "Ton livreur est en route" : "Ta commande est prête") : "Ton livreur est arrivé";

/**
 * Suivi d'une commande. Dans la conversation, une carte compacte ; un clic
 * ouvre le panneau de suivi sur le côté (en bas sur téléphone), ouvert de
 * lui-même juste après le paiement.
 */
export function OrderTracker({ order }: { order: PlacedOrder }) {
  const clock = useOrderClock(order);
  // Ouvert de lui-même juste après le paiement (pas pour une commande programmée, qui attend son heure).
  const [open, setOpen] = useState(() => !order.scheduled && Date.now() - Date.parse(order.placedAt) < 5000);
  const { phase, now, arrives } = clock;
  // Reçue (ici ou depuis la pastille) : la carte disparaît.
  const [received, setReceived] = useState(() => Boolean((order as StoredOrder).receivedAt));
  useEffect(() => {
    const onThanks = (e: Event) => (e as CustomEvent<PlacedOrder>).detail.code === order.code && setReceived(true);
    window.addEventListener(THANKS_EVENT, onThanks);
    return () => window.removeEventListener(THANKS_EVENT, onThanks);
  }, [order.code]);

  // Reçue : la carte s'efface (la pastille dit merci), la conversation reste légère.
  if (received && !open) return null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="booking-step flex w-full items-center gap-4 p-4 text-left transition hover:bg-bg-muted/50" aria-haspopup="dialog">
        <ProgressRing fills={clock.fills} phase={phase} size={56} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{titleOf(phase, order.restaurant, clock.accepted, clock.waiting)}</span>
          <span className="block text-xs text-fg-muted">
            {phase === 2
              ? "Montre-lui ton code"
              : clock.waiting
                ? `Livraison ${dayLabel(arrives).toLowerCase()} vers ${time.format(new Date(arrives))}`
                : `Arrivée vers ${time.format(new Date(arrives))} · dans ${remaining(arrives - now)}`}
          </span>
        </span>
        <span className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-accent-fg" style={{ background: PERSONA }}>
          Suivre
        </span>
      </button>
      {open ? <OrderPanel order={order} clock={clock} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/**
 * Livreur arrivé : la carte s'efface derrière un billet, façon carte
 * d'embarquement. Chorégraphie : le fond rose s'allume, le billet monte en
 * se redressant (perspective), le QR code se révèle du centre vers les bords,
 * le code s'écrit, puis un reflet passe. Ensuite, le billet flotte à peine
 * et une onde part du QR code toutes les quelques secondes, pour attirer l'œil.
 */
function ArrivalCode({ order, courierName }: { order: PlacedOrder; courierName: string | null }) {
  return (
    <div className="order-arrival absolute inset-0 flex flex-col items-center justify-center gap-4 overflow-hidden px-6 pt-16 pb-12 text-center text-white">
      <div aria-hidden="true" className="order-arrival-glow absolute inset-0" />
      <p className="order-arrival-title relative text-[13px] font-medium tracking-wide text-white/85">
        {courierName ? `${courierName} est devant chez toi` : "Ton livreur est devant chez toi"}
      </p>

      <div className="order-ticket-wrap relative">
        <span aria-hidden="true" className="order-ticket-wave absolute inset-x-6 top-6 aspect-square rounded-[2rem]" />
        <div className="order-ticket relative w-[min(16.5rem,calc(32dvh+5rem))] text-left text-neutral-900">
          {/* Haut du billet : restaurant et QR code */}
          <div className="order-ticket-top rounded-t-[1.75rem] bg-white px-5 pt-4 pb-5">
            <div className="flex items-center justify-between gap-3">
              <span className="truncate text-[11px] font-semibold tracking-[0.14em] text-neutral-500 uppercase">
                {order.emoji} {order.restaurant}
              </span>
              <span className="shrink-0 text-[11px] font-semibold tracking-[0.14em] text-neutral-400 uppercase">BTM</span>
            </div>
            <div className="order-ticket-qr relative mx-auto mt-3 aspect-square w-[min(11.5rem,32dvh)]">
              <CleanQr text={order.code} label={`QR code de la commande ${order.code}`} />
            </div>
          </div>
          {/* Perforation */}
          <div aria-hidden="true" className="relative h-0 border-t-2 border-dashed border-neutral-200 bg-white" />
          {/* Bas du billet : le code à dicter */}
          <div className="order-ticket-bottom rounded-b-[1.75rem] bg-white px-5 pt-3.5 pb-4">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-neutral-400 uppercase">Code de commande</p>
            <p className="mt-0.5 font-mono text-[1.65rem] leading-tight font-semibold tracking-[0.12em] select-all" aria-label={`Code ${order.code}`}>
              {[...order.code].map((c, i) => (
                <span key={i} aria-hidden="true" className="order-ticket-char inline-block" style={{ animationDelay: `${900 + i * 45}ms` }}>
                  {c}
                </span>
              ))}
            </p>
          </div>
          <span aria-hidden="true" className="order-ticket-shine pointer-events-none absolute inset-0 rounded-[1.75rem]" />
        </div>
      </div>

      <p className="order-arrival-hint relative text-xs text-white/70">Montre ce QR code ou dicte le code au livreur</p>
    </div>
  );
}

/** Contact de GROUPE BTM pour l'aide sur une commande. */
const SUPPORT_EMAIL = "contact@btm.yt";

type Sheet = "code" | "details" | "help" | "chat";

/** Volet qui monte par-dessus le panneau (code agrandi, détails, aide, messages). */
function SubSheet({ title, onClose, tall, children }: { title: string; onClose: () => void; tall?: boolean; children: ReactNode }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div aria-hidden="true" onClick={onClose} className="order-backdrop absolute inset-0 bg-black/40" />
      <div className={`order-subsheet relative flex max-h-[88%] flex-col rounded-t-3xl bg-bg px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl ${tall ? "h-[80%]" : ""}`}>
        <span aria-hidden="true" className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-border" />
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <h3 className="text-base font-semibold">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Fermer" className="grid size-8 place-items-center rounded-full bg-bg-muted text-lg leading-none text-fg-muted pointer-coarse:size-10 hover:text-fg">
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}

/** Bouton rond d'action (appeler, écrire…), avec un libellé dessous. */
function RoundAction({ icon, label, href, onClick, badge }: { icon: string; label: string; href?: string; onClick?: () => void; badge?: number }) {
  const inner = (
    <>
      <span className="relative grid size-11 place-items-center rounded-full bg-bg-subtle text-lg transition group-hover:bg-bg-muted group-active:scale-95">
        {icon}
        {badge ? (
          <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: PERSONA }}>
            {badge}
          </span>
        ) : null}
      </span>
      <span className="text-[11px] text-fg-muted">{label}</span>
    </>
  );
  const className = "group flex flex-col items-center gap-1";
  return href ? (
    <a href={href} className={className}>
      {inner}
    </a>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}

/**
 * Panneau de suivi, sur une seule page sans défilement : la carte en direct
 * prend la place libre, la fiche du bas tient tout l'essentiel (état, heure,
 * code, livreur) et les boutons ouvrent des volets pour le reste.
 * Plein écran sur téléphone, colonne à droite sur ordinateur.
 */
function OrderPanel({ order, clock, onClose }: { order: PlacedOrder; clock: ReturnType<typeof useOrderClock>; onClose: () => void }) {
  const { phase, now, placed, ready, arrives, accepted } = clock;
  const arrived = phase === 2 && accepted;
  // La carte reste le temps de s'effacer derrière le billet, puis elle est retirée.
  const [mapGone, setMapGone] = useState(false);
  useEffect(() => {
    if (!arrived) return;
    const timer = window.setTimeout(() => setMapGone(true), 700);
    return () => window.clearTimeout(timer);
  }, [arrived]);
  const [closing, setClosing] = useState(false);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const messageCount = useCourierMessageCount(order.code);
  // Sans animation (réglage « réduire les animations »), rien ne signalerait la fin de la sortie : fermeture immédiate.
  const close = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? onClose() : setClosing(true));
  // Le panneau se ferme d'abord en douceur, puis la pastille dit merci (sinon le panneau la cacherait).
  const received = () => {
    close();
    window.setTimeout(() => markReceived(order.code), 320);
  };

  // Échap ferme d'abord le volet ouvert, puis le panneau.
  const escapeRef = useRef(close);
  useEffect(() => {
    escapeRef.current = () => (sheet ? setSheet(null) : close());
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && escapeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, []);

  // Trajet : le restaurant, la livraison, et le livreur qui avance au rythme du suivi.
  const route = useMemo(() => {
    const from = order.from ?? restaurantPoint(order.restaurant, "Mamoudzou");
    const to = order.to ?? deliveryPoint(order.code, order.commune, null, from);
    return { from, to, path: routePath(from, to, order.code) };
  }, [order.from, order.to, order.restaurant, order.code, order.commune]);
  // Vraies routes (OSRM) ; tant qu'elles chargent ou si le calcul échoue, une courbe entre les deux points.
  const roads = useRoadRoutes(route.from, route.to);
  const planned = roads?.main ?? route.path;
  // Livreur simulé : il prend le chemin de rechange quand il y en a un, et l'itinéraire affiché se recalcule.
  // Avec un vrai partenaire, sa position GPS remplacera ce trajet.
  const driven = roads?.alt ?? planned;
  const progress = phase === 2 ? 1 : accepted ? Math.min(1, Math.max(0, (now - clock.pickup) / Math.max(1, arrives - clock.pickup))) : 0;
  const courierAt = accepted ? positionAt(driven, progress) : null;
  const live = useLiveRoute(planned, courierAt, route.to);
  const ahead = useMemo(() => (courierAt ? remainingFrom(live.path, courierAt) : live.path), [courierAt, live.path]);
  const trail = useMemo(() => (accepted ? travelledPart(driven, progress) : []), [accepted, driven, progress]);
  const km = routeKm(ahead);
  const mapsLink = courierAt
    ? `https://www.google.com/maps/dir/?api=1&origin=${courierAt.lat},${courierAt.lng}&destination=${route.to.lat},${route.to.lng}&travelmode=driving`
    : `https://www.google.com/maps/search/?api=1&query=${route.from.lat},${route.from.lng}`;

  const courier = accepted ? (order.courier ?? null) : null;
  const help = (subject: string) =>
    `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Commande ${order.code} : ${subject}`)}&body=${encodeURIComponent(
      `Bonjour,\n\nCommande ${order.code} chez ${order.restaurant}, passée à ${time.format(new Date(placed))}, livrée à ${order.commune}.\n\n`,
    )}`;
  const steps = ["Préparation", "En route", "Arrivé"];

  return createPortal(
    <div className="fixed inset-0 z-[70]" data-closing={closing || undefined}>
      <div aria-hidden="true" onClick={close} className="order-backdrop absolute inset-0 bg-black/40 backdrop-blur-md" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Suivi de la commande"
        tabIndex={-1}
        onAnimationEnd={(e) => closing && e.target === e.currentTarget && onClose()}
        className="order-sheet absolute inset-0 flex flex-col overflow-hidden bg-bg shadow-2xl outline-none sm:inset-y-3 sm:right-3 sm:left-auto sm:w-[440px] sm:rounded-3xl sm:border sm:border-border"
      >
        {/* Carte en direct : prend toute la place libre. Livreur arrivé : la carte laisse place au QR code. */}
        <div className="relative min-h-[8rem] flex-1">
          {mapGone ? null : (
            <div className={`absolute inset-0 ${arrived ? "order-map-out" : ""}`}>
              <CourierMap
                from={route.from}
                to={route.to}
                route={ahead}
                trail={trail}
                courier={courierAt}
                restaurantEmoji={order.emoji}
                moving={phase === 1 && accepted}
              />
            </div>
          )}
          {arrived ? <ArrivalCode order={order} courierName={courier?.name ?? null} /> : null}
          <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-2 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={close}
              aria-label="Fermer le suivi"
              className="grid size-10 place-items-center rounded-full bg-bg/90 text-xl leading-none shadow-lg backdrop-blur hover:bg-bg"
            >
              ×
            </button>
            {order.demo ? <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning shadow">Démo</span> : null}
            {arrived ? null : (
            <a
              href={mapsLink}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-bg/90 px-3 py-2 text-xs font-semibold shadow-lg backdrop-blur hover:bg-bg"
            >
              🗺️ Ouvrir dans Maps
            </a>
            )}
          </div>
          {live.rerouted ? (
            <span className="order-rise absolute top-16 left-1/2 -translate-x-1/2 rounded-full bg-fg px-3 py-1.5 text-xs font-semibold text-bg shadow-lg">
              ↻ Autre chemin : itinéraire recalculé
            </span>
          ) : null}
          {phase === 1 && accepted ? (
            <span className="absolute bottom-9 left-3 rounded-full bg-bg/90 px-2.5 py-1 text-[11px] font-semibold shadow backdrop-blur tabular-nums">
              {km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1).replace(".", ",")} km`} restants
            </span>
          ) : null}
        </div>

        {/* Fiche du bas : tout l'essentiel, sans défilement */}
        <div className="relative -mt-5 shrink-0 space-y-4 rounded-t-3xl bg-bg px-5 pt-5 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_-15px_rgb(0_0_0/0.35)]">
          {/* État et heure d'arrivée */}
          <div className="order-rise flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-lg leading-tight font-semibold">{titleOf(phase, order.restaurant, clock.accepted, clock.waiting)}</p>
              <p className="mt-0.5 truncate text-xs text-fg-muted">
                {order.emoji} {order.restaurant} · livraison à {order.commune}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{time.format(new Date(arrives))}</p>
              <p className="mt-1 text-[11px] text-fg-muted">{phase === 2 ? "Arrivé" : `dans ${remaining(arrives - now)}`}</p>
            </div>
          </div>

          {/* Étapes : barre en trois parties */}
          <div className="order-rise [animation-delay:40ms]">
            <div className="grid grid-cols-3 gap-1.5">
              {clock.fills.map((fill, i) => (
                <span key={steps[i]} className="h-1.5 overflow-hidden rounded-full bg-bg-muted">
                  <span className="block h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${fill * 100}%`, background: PERSONA }} />
                </span>
              ))}
            </div>
            <div className="mt-1.5 grid grid-cols-3 text-[11px]">
              {steps.map((label, i) => (
                <span key={label} className={`${i === 1 ? "text-center" : i === 2 ? "text-right" : ""} ${i <= phase ? "font-semibold" : "text-fg-muted"}`}>
                  {label} <span className="font-normal text-fg-muted">{time.format(new Date([placed, ready, arrives][i]))}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Code et livreur (une fois arrivé, le code est en grand au-dessus : restent l'appel et les messages) */}
          {arrived ? (
            courier ? (
              <div className="order-rise grid grid-cols-2 gap-2 [animation-delay:80ms]">
                <a href={telLink(courier.phone)} className="flex items-center justify-center gap-2 rounded-full border border-border px-3 py-2.5 text-sm font-semibold transition hover:bg-bg-subtle">
                  📞 Appeler {courier.name}
                </a>
                <button
                  type="button"
                  onClick={() => setSheet("chat")}
                  className="relative flex items-center justify-center gap-2 rounded-full border border-border px-3 py-2.5 text-sm font-semibold transition hover:bg-bg-subtle"
                >
                  💬 Écrire{messageCount ? ` (${messageCount})` : ""}
                </button>
              </div>
            ) : null
          ) : accepted ? (
            <div className="order-rise flex items-center gap-3 [animation-delay:80ms]">
              <button
                type="button"
                onClick={() => setSheet("code")}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-border p-2 pr-3 text-left transition hover:bg-bg-subtle"
              >
                <span className="size-14 shrink-0 rounded-xl bg-white p-0.5">
                  <StyledQr text={order.code} label={`QR code de la commande ${order.code}`} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[11px] text-fg-muted">Ton code · touche pour agrandir</span>
                  <span className="block font-mono text-lg font-semibold tracking-[0.15em]">{order.code}</span>
                </span>
              </button>
              {courier ? (
                <div className="flex shrink-0 gap-3">
                  <RoundAction icon="📞" label="Appeler" href={telLink(courier.phone)} />
                  <RoundAction icon="💬" label="Écrire" onClick={() => setSheet("chat")} badge={messageCount} />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="order-rise flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3 [animation-delay:80ms]">
              <span aria-hidden="true" className="text-xl">
                🔒
              </span>
              <p className="text-xs text-fg-muted">
                {phase === 0 ? (
                  <>
                    Ton code et son QR code apparaîtront quand le livreur confirmera avoir récupéré ta commande, vers{" "}
                    <span className="font-semibold text-fg">{time.format(new Date(ready))}</span>.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-fg">Le livreur est au restaurant.</span> Ton code apparaît dès qu&apos;il confirme avoir ta commande en main.
                  </>
                )}
              </p>
            </div>
          )}
          {courier ? (
            <p className="-mt-2 truncate text-xs text-fg-muted">
              🛵 <span className="font-medium text-fg">{courier.name}</span> te livre · {formatPhone(courier.phone)}
              {order.demo ? " (fictif)" : ""}
            </p>
          ) : null}

          {/* Actions */}
          <div className="order-rise space-y-2 [animation-delay:120ms]">
            {phase === 2 ? (
              <button
                type="button"
                onClick={received}
                className="w-full rounded-full px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.99]"
                style={{ background: PERSONA }}
              >
                ✓ J&apos;ai reçu ma commande
              </button>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSheet("details")}
                className="flex items-center justify-center gap-2 rounded-full border border-border px-3 py-2.5 text-sm font-semibold transition hover:bg-bg-subtle"
              >
                🧾 Ma commande
              </button>
              <button
                type="button"
                onClick={() => setSheet("help")}
                className="flex items-center justify-center gap-2 rounded-full border border-border px-3 py-2.5 text-sm font-semibold transition hover:bg-bg-subtle"
              >
                🛟 Aide
              </button>
            </div>
            {order.demo ? <p className="text-center text-[10px] text-fg-muted">Démonstration : suivi accéléré et livreur simulé, aucun restaurant n&apos;a reçu cette commande.</p> : null}
          </div>
        </div>

        {sheet === "code" ? (
          <SubSheet title="Ton code de commande" onClose={() => setSheet(null)}>
            <OrderTicket code={order.code} />
          </SubSheet>
        ) : null}

        {sheet === "details" ? (
          <SubSheet title="Ma commande" onClose={() => setSheet(null)}>
            <div className="space-y-4 text-sm">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="grid size-11 place-items-center rounded-2xl bg-bg-subtle text-2xl">
                  {order.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold">{order.restaurant}</span>
                  <span className="block text-xs text-fg-muted">
                    Commandée à {time.format(new Date(placed))}
                    {accepted ? ` · code ${order.code}` : ""}
                  </span>
                </span>
              </div>
              <ul className="divide-y divide-border rounded-2xl border border-border">
                {order.lines.map((line, i) => (
                  <li key={`${line}-${i}`} className="px-4 py-2.5">
                    {line}
                  </li>
                ))}
              </ul>
              <dl className="space-y-2 rounded-2xl bg-bg-subtle px-4 py-3 text-xs">
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">Livraison</dt>
                  <dd className="text-right">{order.address ? `${order.address} · ${order.commune}` : order.commune}</dd>
                </div>
                {order.note ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-fg-muted">Ton mot</dt>
                    <dd className="text-right">« {order.note} »</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-muted">Paiement</dt>
                  <dd>Portefeuille{order.demo ? " (démo)" : ""}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 border-t border-border pt-2">
                  <dt className="font-medium">Total payé</dt>
                  <dd className="text-base font-semibold tabular-nums">{formatEuros(order.totalCents)}</dd>
                </div>
              </dl>
            </div>
          </SubSheet>
        ) : null}

        {sheet === "help" ? (
          <SubSheet title="Besoin d'aide ?" onClose={() => setSheet(null)}>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border text-sm">
              {[
                ...(courier
                  ? [
                      { icon: "💬", label: "Écrire au livreur", hint: `Une précision pour ${courier.name}`, onClick: () => setSheet("chat") },
                      { icon: "📞", label: "Appeler le livreur", hint: formatPhone(courier.phone), href: telLink(courier.phone) },
                    ]
                  : []),
                { icon: "⏱️", label: "Ma commande est en retard", hint: "On regarde avec le restaurant", href: help("en retard") },
                { icon: "🍽️", label: "Il manque un plat ou il y a une erreur", hint: "Remboursement si besoin", href: help("plat manquant ou erreur") },
                ...(phase === 0 ? [{ icon: "✋", label: "Annuler ma commande", hint: "Possible tant qu'elle est en préparation", href: help("annulation") }] : []),
                { icon: "✉️", label: "Écrire à GROUPE BTM", hint: SUPPORT_EMAIL, href: help("question") },
              ].map((item) => {
                const content = (
                  <>
                    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-bg-subtle text-base">
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{item.label}</span>
                      <span className="block truncate text-xs text-fg-muted">{item.hint}</span>
                    </span>
                    <span aria-hidden="true" className="text-fg-muted">
                      ›
                    </span>
                  </>
                );
                const className = "flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-bg-subtle";
                return (
                  <li key={item.label}>
                    {"href" in item && item.href ? (
                      <a href={item.href} className={className}>
                        {content}
                      </a>
                    ) : (
                      <button type="button" onClick={"onClick" in item ? item.onClick : undefined} className={className}>
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {order.demo ? <p className="mt-3 text-center text-[11px] text-fg-muted">Démonstration : le message part vers GROUPE BTM, pas vers le restaurant.</p> : null}
          </SubSheet>
        ) : null}

        {sheet === "chat" && courier ? (
          <SubSheet title={`${courier.name}, ton livreur`} onClose={() => setSheet(null)} tall>
            <CourierChat order={order} courier={courier} phase={phase} arrives={arrives} />
          </SubSheet>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/**
 * Pastille « Ma commande », toujours visible pendant la conversation : on
 * retrouve le suivi sans remonter jusqu'au message de la commande. Un clic
 * ouvre le panneau ; elle disparaît quand la commande est reçue.
 */
export function ActiveOrderTab() {
  const [active, setActive] = useState<PlacedOrder | null>(null);
  // Commande tout juste marquée reçue : la pastille dit merci avant de partir.
  const [thanks, setThanks] = useState<PlacedOrder | null>(null);
  const thanked = useCallback(() => setThanks(null), []);

  useEffect(() => {
    const read = () => setActive(activeOrder()?.order ?? null);
    const onThanks = (e: Event) => setThanks((e as CustomEvent<PlacedOrder>).detail);
    window.addEventListener(THANKS_EVENT, onThanks);
    read();
    window.addEventListener(ORDER_EVENT, read);
    window.addEventListener("storage", read);
    // Relue chaque minute : une commande arrivée depuis longtemps finit par disparaître.
    const timer = window.setInterval(read, 60_000);
    return () => {
      window.removeEventListener(THANKS_EVENT, onThanks);
      window.removeEventListener(ORDER_EVENT, read);
      window.removeEventListener("storage", read);
      window.clearInterval(timer);
    };
  }, []);

  if (thanks) return <ThanksPill key={thanks.code} order={thanks} onDone={thanked} />;
  return active ? <OrderPill key={active.code} order={active} /> : null;
}

/** Durée du remerciement avant que la pastille s'en aille. */
const THANKS_MS = 3600;
const LEAVE_MS = 520;

/**
 * Remerciement du restaurant, à la place de la pastille « Ma commande » :
 * elle s'ouvre en grand avec une coche et des confettis, dit merci, puis
 * s'envole.
 */
function ThanksPill({ order, onDone }: { order: PlacedOrder; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const pill = useRef<HTMLDivElement>(null);
  useEffect(() => {
    notify({ id: `${order.code}:received`, emoji: "✅", title: "Commande reçue", subtitle: `${order.restaurant} te remercie · bon appétit !`, at: new Date().toISOString() });
  }, [order]);
  // En partant, la pastille entre dans la cloche des notifications (sinon elle s'envole vers le haut).
  useEffect(() => {
    if (leaving) flyToBell(pill.current);
  }, [leaving]);
  // Minuteurs seulement (pas d'événement de fin d'animation) : la pastille part toujours, animations coupées comprises.
  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), THANKS_MS);
    const done = window.setTimeout(onDone, THANKS_MS + Math.max(LEAVE_MS, FLY_MS));
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, [onDone]);

  return (
    <div
      ref={pill}
      role="status"
      data-leaving={leaving || undefined}
      className="order-thanks absolute top-14 right-3 z-30 sm:right-16 flex items-center gap-3 overflow-hidden rounded-3xl border border-border bg-bg/95 py-2.5 pr-5 pl-2.5 shadow-2xl backdrop-blur sm:top-3"
    >
      <span className="relative grid size-11 shrink-0 place-items-center">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} aria-hidden="true" className="order-confetti" style={{ "--a": `${i * 36}deg`, "--d": `${i * 25}ms` } as CSSProperties} />
        ))}
        <span className="order-thanks-badge grid size-11 place-items-center rounded-full text-xl text-white" style={{ background: PERSONA }}>
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path className="order-thanks-check" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
      </span>
      <span className="order-thanks-text leading-tight">
        <span className="block text-sm font-semibold">
          {order.emoji} {order.restaurant} te remercie !
        </span>
        <span className="block text-xs text-fg-muted">Merci pour ta commande · bon appétit 😋</span>
      </span>
    </div>
  );
}

function OrderPill({ order }: { order: PlacedOrder }) {
  const clock = useOrderClock(order);
  const [open, setOpen] = useState(false);
  const { phase, now, arrives } = clock;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label="Suivre ma commande"
        className="order-pill absolute top-14 right-3 z-30 sm:right-16 flex items-center gap-2.5 overflow-hidden rounded-full border border-[var(--persona-border,var(--border))] bg-bg/95 py-1 pr-3 pl-1 text-left shadow-lg backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:scale-[1.03] hover:shadow-xl active:scale-95 sm:top-3"
      >
        {/* Reflet qui balaie la pastille de temps en temps, et éclat à chaque nouvelle étape. */}
        <span aria-hidden="true" className="order-shimmer pointer-events-none absolute inset-0" />
        <span key={`flash-${phase}`} aria-hidden="true" className="order-flash pointer-events-none absolute inset-0 rounded-full" />
        <span className={`relative shrink-0 rounded-full ${phase < 2 ? "order-halo" : "order-halo-success"}`}>
          <ProgressRing fills={clock.fills} phase={phase} size={36} />
        </span>
        <span key={`text-${phase}`} className="order-swap relative leading-tight">
          <span className="block text-xs font-semibold">
            {phase === 2 ? "Ton livreur est là" : clock.waiting ? "Programmée" : phase === 0 ? "En préparation" : "En route"}
          </span>
          <span className="block text-[11px] text-fg-muted tabular-nums">
            {phase === 2 ? "Montre ton code" : clock.waiting ? `Livraison vers ${time.format(new Date(arrives))}` : `Arrivée dans ${remaining(arrives - now)}`}
          </span>
        </span>
        {/* Petite scène : la poêle qui grésille, le scooter qui roule, la coche qui saute. */}
        <span
          key={`icon-${phase}`}
          aria-hidden="true"
          className={`relative text-lg leading-none ${phase === 0 ? "order-sizzle" : phase === 1 ? "order-scooter-ride" : "order-hop"}`}
        >
          {clock.waiting ? "⏰" : phase === 0 ? "🍳" : phase === 1 ? "🛵" : "✅"}
        </span>
      </button>
      {open ? <OrderPanel order={order} clock={clock} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

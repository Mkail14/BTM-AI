"use client";

import { Pictogram } from "@/components/ui/Pictogram";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BELL_ID, dismiss, lastSeen, markSeen, NOTIFY_EVENT, readHidden, readLocal, RING_EVENT, type AppNotification } from "@/lib/notifications";

const relative = new Intl.RelativeTimeFormat("fr-FR", { numeric: "auto" });
const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Indian/Mayotte" });

/** « à l'instant », « il y a 5 min », « hier », « 12 oct. ». */
function ago(iso: string, now: number) {
  const s = Math.round((Date.parse(iso) - now) / 1000);
  if (s > -60) return "à l'instant";
  if (s > -3600) return relative.format(Math.round(s / 60), "minute");
  if (s > -86_400) return relative.format(Math.round(s / 3600), "hour");
  if (s > -2 * 86_400) return relative.format(-1, "day");
  return date.format(new Date(iso));
}

/** Distance du glissement (doigt) au-delà de laquelle la notification est supprimée. */
const SWIPE_DELETE_PX = 90;
/** Durée du repli d'une ligne supprimée (suit la transition de la ligne). */
const REMOVE_MS = 260;

/**
 * Une notification supprimable. Ordinateur : une croix apparaît au survol.
 * Téléphone : on la fait glisser vers la gauche (le fond rouge « Supprimer »
 * apparaît), ou on touche la petite croix. Elle se replie avant de disparaître.
 */
function NotificationRow({ onRemove, children }: { onRemove: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const remove = () => {
    if (removing) return;
    setRemoving(true);
    setDx((d) => (d < 0 ? -window.innerWidth : d));
    window.setTimeout(onRemove, REMOVE_MS);
  };

  // Un glissement n'ouvre pas la notification.
  function guard(e: MouseEvent) {
    if (!moved.current) return;
    e.preventDefault();
    e.stopPropagation();
    moved.current = false;
  }

  return (
    <li className={`grid transition-[grid-template-rows,opacity] duration-[260ms] ease-out ${removing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr]"}`}>
      <div className="group/notif relative min-h-0 overflow-hidden rounded-2xl">
        {/* Fond révélé par le glissement. */}
        <div
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-end rounded-2xl bg-danger px-5 text-xs font-semibold text-danger-fg"
          style={{ opacity: Math.min(1, -dx / SWIPE_DELETE_PX) }}
        >
          Supprimer
        </div>
        <div
          className={`relative bg-bg ${dragging ? "" : "transition-transform duration-200 ease-out"}`}
          style={{ transform: dx ? `translateX(${dx}px)` : undefined, touchAction: "pan-y" }}
          onClickCapture={guard}
          onPointerDown={(e) => {
            if (e.pointerType === "mouse") return;
            start.current = { x: e.clientX, y: e.clientY };
            moved.current = false;
          }}
          onPointerMove={(e) => {
            if (!start.current) return;
            const x = e.clientX - start.current.x;
            const y = e.clientY - start.current.y;
            // Défilement vertical : on laisse faire.
            if (!moved.current && Math.abs(y) > Math.abs(x) && Math.abs(y) > 8) {
              start.current = null;
              return;
            }
            if (Math.abs(x) > 8) {
              moved.current = true;
              setDragging(true);
              setDx(Math.min(0, x));
            }
          }}
          onPointerUp={() => {
            if (!start.current) return;
            start.current = null;
            setDragging(false);
            if (dx < -SWIPE_DELETE_PX) remove();
            else setDx(0);
          }}
          onPointerCancel={() => {
            start.current = null;
            setDragging(false);
            setDx(0);
          }}
        >
          {children}
          <button
            type="button"
            onClick={remove}
            aria-label="Supprimer la notification"
            title="Supprimer"
            className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full border border-border bg-bg text-fg-muted opacity-0 shadow-sm transition group-hover/notif:opacity-100 hover:border-danger hover:text-danger focus-visible:opacity-100 pointer-coarse:top-2 pointer-coarse:size-6 pointer-coarse:translate-y-0 pointer-coarse:opacity-60"
          >
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
    </li>
  );
}

const startOfDay =(now: number) => new Date(new Date(now).toLocaleDateString("en-CA", { timeZone: "Indian/Mayotte" }) + "T00:00:00+03:00").getTime();

/**
 * Cloche des notifications : livraisons, paiements, recharges, réservations
 * du code. La pastille compte les nouveautés depuis la dernière ouverture.
 * Les notifications animées qui s'en vont entrent dans la cloche : elle sonne.
 * Ouverte, la liste descend de la cloche sur fond flouté, ligne par ligne.
 */
export function NotificationBell() {
  const [server, setServer] = useState<AppNotification[]>([]);
  const [local, setLocal] = useState<AppNotification[]>([]);
  const [seen, setSeen] = useState(0);
  const [open, setOpen] = useState(false);
  const [ring, setRing] = useState(0);
  const [now, setNow] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const button = useRef<HTMLButtonElement>(null);
  const [place, setPlace] = useState({ top: 0, right: 0 });

  const loadServer = useCallback(() => {
    fetch("/api/notifications", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ items: AppNotification[] }>) : null))
      .then((body) => body && setServer(body.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const read = () => {
      setLocal(readLocal());
      setSeen(lastSeen());
      setHidden(readHidden());
    };
    read();
    loadServer();
    const onRing = () => setRing((n) => n + 1);
    // Nouvelle notification sur cet appareil : la liste du serveur peut avoir changé aussi (paiement…).
    const onNotify = () => {
      read();
      loadServer();
    };
    window.addEventListener(NOTIFY_EVENT, onNotify);
    window.addEventListener(RING_EVENT, onRing);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(NOTIFY_EVENT, onNotify);
      window.removeEventListener(RING_EVENT, onRing);
      window.removeEventListener("storage", read);
    };
  }, [loadServer]);

  const items = [...new Map([...local, ...server].map((n) => [n.id, n])).values()].sort((a, b) => b.at.localeCompare(a.at))
    .filter((n) => !hidden.has(n.id));
  const unread = items.filter((n) => Date.parse(n.at) > seen).length;

  const toggle = () => {
    if (open) return setOpen(false);
    const rect = button.current?.getBoundingClientRect();
    if (rect) setPlace({ top: rect.bottom + 10, right: Math.max(12, window.innerWidth - rect.right - 8) });
    setNow(Date.now());
    loadServer();
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    markSeen();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const today = startOfDay(now || 0);
  const groups = [
    { title: "Aujourd'hui", list: items.filter((n) => Date.parse(n.at) >= today) },
    { title: "Plus tôt", list: items.filter((n) => Date.parse(n.at) < today) },
  ].filter((g) => g.list.length);

  return (
    <>
      <button
        ref={button}
        id={BELL_ID}
        type="button"
        onClick={toggle}
        aria-label={unread ? `Notifications : ${unread} nouvelle${unread > 1 ? "s" : ""}` : "Notifications"}
        aria-expanded={open}
        className="relative rounded-full p-2 text-fg-muted transition hover:bg-bg-muted hover:text-fg"
      >
        <svg
          key={ring}
          viewBox="0 0 24 24"
          width={22}
          height={22}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={ring ? "notif-bell-ring" : ""}
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10.3 20a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread ? (
          <span
            key={`b${unread}`}
            className="notif-badge absolute top-1 right-1 grid min-w-[1.1rem] place-items-center rounded-full px-1 text-[10px] leading-[1.1rem] font-bold text-white"
            style={{ background: "var(--persona,var(--accent))" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open
        ? createPortal(
            <>
              <div aria-hidden="true" onClick={close} className="order-backdrop fixed inset-0 z-[60] bg-black/25 backdrop-blur-sm" />
              <div
                role="dialog"
                aria-label="Notifications"
                style={{
                  top: place.top,
                  right: place.right,
                  // Jusqu'au bas de l'écran visible, au-dessus de la barre d'accueil de l'iPhone.
                  maxHeight: `min(32rem, calc(100dvh - ${place.top}px - max(0.75rem, env(safe-area-inset-bottom))))`,
                }}
                className="notif-panel scrollbar-none fixed z-[61] w-[min(23rem,calc(100vw-1.5rem))] origin-top-right overflow-y-auto overscroll-contain rounded-3xl border border-border bg-bg shadow-2xl"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-bg/95 px-5 py-3.5 backdrop-blur">
                  <p className="font-semibold">Notifications</p>
                  <div className="flex items-center gap-3">
                    {unread ? (
                      <button type="button" onClick={close} className="text-xs font-semibold" style={{ color: "var(--persona,var(--accent))" }}>
                        Tout marquer comme lu
                      </button>
                    ) : null}
                    {items.length ? (
                      <button type="button" onClick={() => dismiss(items.map((n) => n.id))} className="text-xs font-medium text-fg-muted hover:text-danger">
                        Tout effacer
                      </button>
                    ) : null}
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <p className="text-3xl" aria-hidden="true">
                      <Bell size="1em" strokeWidth={1.8} aria-hidden="true" />
                    </p>
                    <p className="mt-2 text-sm font-medium">Rien pour l&apos;instant</p>
                    <p className="mt-1 text-xs text-fg-muted">Tes livraisons, paiements et réservations s&apos;afficheront ici.</p>
                  </div>
                ) : (
                  groups.map((g, gi) => (
                    <section key={g.title} className="px-2 pb-2">
                      <h3 className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-fg-muted uppercase">{g.title}</h3>
                      <ul>
                        {g.list.map((n, i) => {
                          const fresh = Date.parse(n.at) > seen;
                          const body = (
                            <>
                              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-bg-subtle text-lg">
                                <Pictogram of={n.emoji} fallback={Bell} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-start justify-between gap-2">
                                  <span className={`text-sm leading-snug ${fresh ? "font-semibold" : "font-medium"}`}>{n.title}</span>
                                  <span className="shrink-0 pt-0.5 text-[11px] text-fg-muted">{ago(n.at, now)}</span>
                                </span>
                                {n.subtitle ? <span className="mt-0.5 block truncate text-xs text-fg-muted">{n.subtitle}</span> : null}
                              </span>
                              {fresh ? <span aria-label="nouveau" className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: "var(--persona,var(--accent))" }} /> : null}
                            </>
                          );
                          // pr-11 : place de la croix de suppression.
                          const cls = "notif-item flex items-start gap-3 rounded-2xl px-3 py-2.5 pr-11 transition hover:bg-bg-muted";
                          const style = { "--i": gi * 4 + i } as CSSProperties;
                          return (
                            <NotificationRow key={n.id} onRemove={() => dismiss([n.id])}>
                              {n.href ? (
                                <Link href={n.href} onClick={close} className={cls} style={style}>
                                  {body}
                                </Link>
                              ) : (
                                <div className={cls} style={style}>
                                  {body}
                                </div>
                              )}
                            </NotificationRow>
                          );
                        })}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

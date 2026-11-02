"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { FLY_MS, flyToBell, NOTIFY_EVENT } from "@/lib/notifications";

/** Une bonne nouvelle à fêter (place de code réservée…). */
export type CelebrationDetail = { emoji: string; title: string; subtitle?: string; note?: string };

const EVENT = "btm-celebrate";
/** Durée d'affichage avant l'envol. */
const SHOW_MS = 5200;
const LEAVE_MS = Math.max(520, FLY_MS);

/** Affiche la notification animée, où que l'on soit dans la conversation. */
export function celebrate(detail: CelebrationDetail) {
  window.dispatchEvent(new CustomEvent<CelebrationDetail>(EVENT, { detail }));
}

/**
 * Notification de réussite, même animation que le merci de la livraison : la
 * pastille s'ouvre avec un rebond, la coche se dessine, des confettis
 * jaillissent, puis elle s'envole. Un clic la ferme plus tôt.
 */
export function CelebrationToast() {
  const [current, setCurrent] = useState<(CelebrationDetail & { id: number }) | null>(null);
  const [leaving, setLeaving] = useState(false);
  const toast = useRef<HTMLButtonElement>(null);
  // En partant, elle entre dans la cloche des notifications (sinon elle s'envole vers le haut).
  useEffect(() => {
    if (leaving) flyToBell(toast.current);
  }, [leaving]);

  useEffect(() => {
    const onCelebrate = (e: Event) => {
      setLeaving(false);
      setCurrent({ ...(e as CustomEvent<CelebrationDetail>).detail, id: Date.now() });
      // La cloche relit l'historique (la réservation vient d'y entrer).
      window.dispatchEvent(new Event(NOTIFY_EVENT));
    };
    window.addEventListener(EVENT, onCelebrate);
    return () => window.removeEventListener(EVENT, onCelebrate);
  }, []);

  // Minuteurs seulement : la notification part toujours, animations coupées comprises.
  useEffect(() => {
    if (!current) return;
    const leave = window.setTimeout(() => setLeaving(true), SHOW_MS);
    const done = window.setTimeout(() => setCurrent(null), SHOW_MS + LEAVE_MS);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
    };
  }, [current]);

  if (!current) return null;
  return (
    // Centrée en haut de la conversation ; l'élément intérieur porte l'animation.
    <div className="pointer-events-none absolute inset-x-0 top-14 z-40 flex justify-center px-3 sm:top-4">
      <button
        key={current.id}
        ref={toast}
        type="button"
        role="status"
        onClick={() => setLeaving(true)}
        data-leaving={leaving || undefined}
        className="order-thanks pointer-events-auto flex max-w-md items-center gap-3 overflow-hidden rounded-3xl border border-border bg-bg/95 py-3 pr-5 pl-3 text-left shadow-2xl backdrop-blur"
      >
        <span className="relative grid size-12 shrink-0 place-items-center">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} aria-hidden="true" className="order-confetti" style={{ "--a": `${i * 30}deg`, "--d": `${i * 20}ms` } as CSSProperties} />
          ))}
          <span className="order-thanks-badge grid size-12 place-items-center rounded-full text-white" style={{ background: "var(--persona,var(--accent))" }}>
            <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path className="order-thanks-check" d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
        </span>
        <span className="order-thanks-text min-w-0 leading-tight">
          <span className="block text-sm font-semibold">
            {current.emoji} {current.title}
          </span>
          {current.subtitle ? <span className="mt-0.5 block text-xs text-fg-muted">{current.subtitle}</span> : null}
          {current.note ? <span className="mt-1 block text-[11px] text-fg-muted/80">{current.note}</span> : null}
        </span>
      </button>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

export type Partner = {
  name: string;
  /** Initiales du logo. */
  initials: string;
  /** Deux couleurs du logo (dégradé). */
  colors: readonly [string, string];
  /** Début du partenariat, « AAAA-MM ». */
  since: string;
  /** Ce qu'il fait, en une phrase courte. */
  pitch: string;
};

const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
const sinceLabel = (since: string) => monthFormat.format(new Date(`${since}-01T12:00:00`));

const Chevron = ({ left = false }: { left?: boolean }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
    <path d={left ? "M15 18l-6-6 6-6" : "M9 6l6 6-6 6"} />
  </svg>
);

/**
 * Frise des partenaires : une ligne arc-en-ciel, un point daté par partenaire et
 * sa carte en verre dessous. Elle glisse de gauche à droite en douceur (molette
 * et flèches amorties, doigt libre) ; la page, elle, ne défile pas.
 */
export function PartnerFrise({ partners }: { partners: readonly Partner[] }) {
  const track = useRef<HTMLOListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  // Glissement amorti : la frise rejoint peu à peu sa cible (molette, flèches).
  const target = useRef(0);
  const frame = useRef(0);

  const glideTo = (left: number) => {
    const el = track.current;
    if (!el) return;
    target.current = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, left));
    if (frame.current) return;
    const step = () => {
      const gap = target.current - el.scrollLeft;
      if (Math.abs(gap) < 0.5) {
        el.scrollLeft = target.current;
        frame.current = 0;
        return;
      }
      el.scrollLeft += gap * 0.12;
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () => {
      setEdges({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8 });
      // Doigt ou barre : la cible suit, pour que la molette reparte d'ici.
      if (!frame.current) target.current = el.scrollLeft;
    };
    const onWheel = (e: WheelEvent) => {
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!delta) return;
      e.preventDefault();
      glideTo(target.current + delta * 1.2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", update);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, []);

  const slide = (direction: 1 | -1) => {
    const el = track.current;
    if (el) glideTo(target.current + direction * el.clientWidth * 0.7);
  };

  const arrow =
    "landing-glass grid size-11 place-items-center rounded-full text-fg transition hover:scale-105 disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col justify-center">
      <ol
        ref={track}
        aria-label="Frise des partenaires"
        data-start={edges.start || undefined}
        data-end={edges.end || undefined}
        className="frise flex gap-6 overflow-x-auto overflow-y-hidden overscroll-x-contain px-[max(1.25rem,calc((100vw-64rem)/2))] py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {partners.map((partner, i) => (
          <li key={partner.name} className="frise-jalon landing-rise flex w-[min(72vw,15.5rem)] shrink-0 flex-col" style={{ animationDelay: `${200 + i * 90}ms` }}>
            {/* Date et point sur la ligne */}
            <div className="relative h-8 shrink-0">
              <span className="text-sm font-semibold capitalize">{sinceLabel(partner.since)}</span>
              <span aria-hidden="true" className="frise-point" />
            </div>

            <article className="landing-glass mt-6 flex flex-col items-start rounded-3xl p-6">
              <span
                aria-hidden="true"
                className="grid size-16 place-items-center rounded-2xl text-xl font-bold tracking-tight text-white shadow-lg"
                style={{ background: `linear-gradient(135deg, ${partner.colors[0]}, ${partner.colors[1]})` }}
              >
                {partner.initials}
              </span>
              <h2 className="mt-5 text-lg font-semibold tracking-tight">{partner.name}</h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{partner.pitch}</p>
            </article>
          </li>
        ))}
      </ol>

      <div className="mt-6 flex shrink-0 justify-center gap-3">
        <button type="button" aria-label="Partenaires précédents" className={arrow} disabled={edges.start} onClick={() => slide(-1)}>
          <Chevron left />
        </button>
        <button type="button" aria-label="Partenaires suivants" className={arrow} disabled={edges.end} onClick={() => slide(1)}>
          <Chevron />
        </button>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBackToClose } from "@/components/layout/useBackToClose";

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
  /** Photo (chemin dans /public ou adresse). Sans photo : bandeau aux couleurs du logo. */
  photo?: string;
  /** Comment le partenaire est intégré à Tamilya. */
  integration: string;
  /** Exemple de question à poser à Tamilya. */
  example: string;
  /** Vrai logo (image sombre, posée sur le fond clair `colors`). Sans logo : les initiales. */
  logo?: string;
  /** Site du partenaire (facultatif). */
  website?: string;
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
 * et flèches amorties, doigt libre) ; la page, elle, ne défile pas. Un clic sur
 * une carte ouvre la fiche du partenaire.
 */
export function PartnerFrise({ partners }: { partners: readonly Partner[] }) {
  const track = useRef<HTMLOListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const [open, setOpen] = useState<Partner | null>(null);
  const close = useCallback(() => setOpen(null), []);
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
    <div className="relative flex flex-col pt-[clamp(0px,calc(12vh-4.5rem),3.5rem)] pb-[clamp(0px,calc(5vh-1.5rem),2rem)] [@media(min-height:640px)]:min-h-0">
      <ol
        ref={track}
        aria-label="Frise des partenaires"
        data-start={edges.start || undefined}
        data-end={edges.end || undefined}
        className="frise flex shrink-0 justify-center-safe gap-10 overflow-x-auto [@media(min-height:640px)]:shrink overflow-y-hidden overscroll-x-contain px-[max(1.25rem,calc((100vw-112rem)/2))] py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {partners.map((partner, i) => (
          <li key={partner.name} className="frise-jalon landing-rise flex w-[min(74vw,16.5rem)] shrink-0 flex-col" style={{ animationDelay: `${200 + i * 90}ms` }}>
            {/* Date et point sur la ligne */}
            <div className="relative h-8 shrink-0">
              <span className="text-sm font-semibold capitalize">{sinceLabel(partner.since)}</span>
              <span aria-hidden="true" className="frise-point" />
            </div>

            <button
              type="button"
              onClick={() => setOpen(partner)}
              className="landing-glass mt-7 flex flex-1 cursor-pointer flex-col items-start rounded-3xl p-6 text-left transition hover:-translate-y-1 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              <span
                aria-hidden="true"
                className="grid size-16 place-items-center rounded-2xl text-xl font-bold tracking-tight text-white shadow-lg"
                style={{ background: `linear-gradient(135deg, ${partner.colors[0]}, ${partner.colors[1]})` }}
              >
                {partner.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={partner.logo} alt="" loading="lazy" decoding="async" className="h-11 w-auto object-contain" />
                ) : (
                  partner.initials
                )}
              </span>
              <h2 className="mt-5 text-lg font-semibold tracking-tight">{partner.name}</h2>
              <p className="mt-1.5 text-[14px] leading-relaxed text-fg-muted">{partner.pitch}</p>
              <span className="mt-auto pt-4 text-[13px] font-semibold text-[var(--accent)]">Voir la fiche →</span>
            </button>
          </li>
        ))}
      </ol>

      <div className={`mt-[clamp(0.5rem,calc(5vh-1rem),1.5rem)] flex shrink-0 justify-center gap-3 ${edges.start && edges.end ? "invisible" : ""}`}>
        <button type="button" aria-label="Partenaires précédents" className={arrow} disabled={edges.start} onClick={() => slide(-1)}>
          <Chevron left />
        </button>
        <button type="button" aria-label="Partenaires suivants" className={arrow} disabled={edges.end} onClick={() => slide(1)}>
          <Chevron />
        </button>
      </div>

      {open && <PartnerSheet partner={open} onClose={close} />}
    </div>
  );
}

/** Fiche d'un partenaire : photo, nom, date, et comment il est intégré à Tamilya. */
function PartnerSheet({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const dismiss = useBackToClose(true, onClose);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dismiss]);

  const gradient = `linear-gradient(135deg, ${partner.colors[0]}, ${partner.colors[1]})`;

  return createPortal(
    <div className="landing fixed inset-0 z-[100] grid place-items-center overscroll-none p-4 text-fg" role="dialog" aria-modal="true" aria-labelledby="fiche-partenaire">
      <div aria-hidden="true" className="absolute inset-0 touch-none bg-black/40 backdrop-blur-sm" onClick={dismiss} />
      {/* Écran trop petit (téléphone couché) : la fiche défile à l'intérieur ; sur un téléphone normal, elle tient sans défiler. */}
      <article className="landing-rise relative max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-x-hidden overflow-y-auto overscroll-contain rounded-3xl border border-[color-mix(in_oklab,var(--fg)_10%,transparent)] bg-bg shadow-2xl">
        {/* Photo, ou bandeau aux couleurs du logo */}
        <div className="relative h-[clamp(5.5rem,20dvh,11rem)] overflow-hidden" style={{ background: gradient }}>
          {partner.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={partner.photo} alt={`Photo de ${partner.name}`} loading="lazy" decoding="async" className="size-full object-cover" />
          ) : partner.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={partner.logo} alt={`Logo de ${partner.name}`} loading="lazy" decoding="async" className="mx-auto h-full w-auto max-w-[70%] object-contain py-[clamp(0.75rem,3dvh,2rem)]" />
          ) : (
            <span aria-hidden="true" className="grid size-full place-items-center text-5xl font-bold tracking-tight text-white/90">
              {partner.initials}
            </span>
          )}
          <button
            ref={closeBtn}
            type="button"
            onClick={dismiss}
            aria-label="Fermer la fiche"
            className="zone-appui absolute top-3 right-3 grid size-9 place-items-center rounded-full bg-black/35 text-white backdrop-blur transition hover:bg-black/50"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-4" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="p-5 sm:p-6">
          <p className="text-sm font-semibold text-fg-muted">Partenaire depuis {sinceLabel(partner.since)}</p>
          <h2 id="fiche-partenaire" className="mt-0.5 text-2xl font-semibold tracking-tight">
            {partner.name}
          </h2>
          <p className="mt-1.5 text-[15px] leading-snug text-fg-muted">{partner.pitch}</p>

          <h3 className="mt-4 text-sm font-semibold">Comment c&apos;est intégré à Tamilya</h3>
          <p className="mt-1 text-[15px] leading-snug">{partner.integration}</p>

          <div className="mt-4 rounded-2xl border border-[color-mix(in_oklab,var(--accent)_30%,transparent)] bg-[color-mix(in_oklab,var(--accent)_8%,transparent)] px-4 py-3">
            <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">Essayez de demander</p>
            <p className="mt-1 text-[15px] font-medium">« {partner.example} »</p>
          </div>

          {partner.website && (
            <a
              href={partner.website}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex text-[15px] font-semibold text-fg underline decoration-[color-mix(in_oklab,var(--accent)_60%,transparent)] underline-offset-4 hover:decoration-[var(--accent)]"
            >
              Visiter {partner.website.replace(/^https?:\/\//, "")} ↗
            </a>
          )}
        </div>
      </article>
    </div>,
    document.body,
  );
}

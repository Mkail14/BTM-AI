"use client";

import { Pictogram } from "@/components/ui/Pictogram";
import { useEffect, useRef, useState } from "react";

export type Suggestion = { emoji: string; title: string; hint: string; text: string };

/** Temps d'affichage de chaque carte. */
const SHOW_MS = 5000;
/** Durée de la sortie de l'ancienne carte (doit suivre .gelee-sortie dans globals.css). */
const LEAVE_MS = 260;

/**
 * Téléphone : les idées de l'accueil, une carte à la fois. Elles changent seules
 * le temps d'un tour, puis s'arrêtent sur la première (pas de défilement sans fin) ;
 * un glissement du doigt ou un point permet d'en voir d'autres, et arrête le
 * défilement seul. Un appui envoie l'idée à Tamilya.
 */
export function SuggestionCarousel({
  items,
  disabled,
  onPick,
}: {
  items: readonly Suggestion[];
  disabled: boolean;
  onPick: (text: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<{ index: number; dir: 1 | -1 } | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const [paused, setPaused] = useState(false);
  // Défilement seul : un tour au plus, et plus du tout dès qu'on a touché les cartes.
  const [auto, setAuto] = useState(true);
  const startX = useRef<number | null>(null);
  const swiped = useRef(false);

  const show = (next: number, step: 1 | -1) => {
    setLeaving({ index, dir: step });
    setDir(step);
    setIndex(next);
  };
  const go = (step: 1 | -1) => show((index + step + items.length) % items.length, step);

  // Défilement automatique, en pause pendant un toucher ; il s'arrête en revenant à la première carte.
  useEffect(() => {
    if (!auto || paused || items.length < 2) return;
    const timer = window.setTimeout(() => {
      if (index === items.length - 1) setAuto(false);
      go(1);
    }, SHOW_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- relancé à chaque carte.
  }, [index, paused, auto, items.length]);

  // L'ancienne carte disparaît une fois sortie.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const card = (s: Suggestion) => (
    <span className="flex items-center gap-3 rounded-2xl border border-border bg-bg/70 p-3 text-left shadow-[0_10px_30px_-16px_var(--persona,var(--accent))] backdrop-blur">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--persona-soft,var(--bg-muted))] text-2xl">
        <Pictogram of={s.emoji} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{s.title}</span>
        <span className="block truncate text-xs text-fg-muted">{s.hint}</span>
      </span>
      <span aria-hidden="true" className="text-fg-muted">
        ›
      </span>
    </span>
  );

  const current = items[index];
  if (!current) return null;
  return (
    <div className="awa-hello-rise pb-3 [animation-delay:200ms]" aria-roledescription="carrousel" aria-label="Idées pour commencer">
      <div
        className="relative touch-pan-y"
        onPointerDown={(e) => {
          startX.current = e.clientX;
          swiped.current = false;
          setPaused(true);
        }}
        onPointerUp={(e) => {
          const dx = startX.current === null ? 0 : e.clientX - startX.current;
          startX.current = null;
          setPaused(false);
          if (Math.abs(dx) > 40) {
            swiped.current = true;
            setAuto(false);
            go(dx < 0 ? 1 : -1);
          }
        }}
        onPointerCancel={() => {
          startX.current = null;
          setPaused(false);
        }}
      >
        {leaving && items[leaving.index] ? (
          <div aria-hidden="true" className="gelee-sortie pointer-events-none absolute inset-0" style={{ ["--sens" as string]: String(leaving.dir) }}>
            {card(items[leaving.index])}
          </div>
        ) : null}
        <button
          key={index}
          type="button"
          disabled={disabled}
          onClick={() => {
            // Un glissement n'est pas un appui.
            if (swiped.current) return;
            onPick(current.text);
          }}
          aria-label={`${current.title} : ${current.hint}`}
          className="gelee-entree block w-full disabled:opacity-50"
          style={{ ["--sens" as string]: String(dir) }}
        >
          {card(current)}
        </button>
      </div>

      {/* Points : la carte affichée, et un appui pour aller à une autre. */}
      {/* Point de 6 px dans une zone d'appui de 28 px, assez grande pour le doigt. */}
      <div className="mt-0.5 -mb-2 flex justify-center">
        {items.map((s, i) => (
          <button
            key={s.title}
            type="button"
            aria-label={`Idée ${i + 1} : ${s.title}`}
            aria-current={i === index || undefined}
            onClick={() => {
              setAuto(false);
              if (i !== index) show(i, i > index ? 1 : -1);
            }}
            className="grid h-7 place-items-center px-[3px]"
          >
            <span
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? "w-5 bg-[var(--persona,var(--accent))]" : "w-1.5 bg-fg-muted/40"}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

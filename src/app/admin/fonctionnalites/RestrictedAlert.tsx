"use client";

import { TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FeatureInfo } from "@/lib/site/features-rules";

/** Secondes avant que « Activer quand même » se débloque. */
const WAIT_S = 10;

/**
 * Alerte au centre de l'écran avant d'ouvrir au public une fonctionnalité qu'on n'a pas encore
 * le droit d'ouvrir (restricted). « Quitter » ne change rien ; « Activer quand même » ne se
 * débloque qu'à la fin du compte à rebours. Rien ne s'active tout seul.
 */
export function RestrictedAlert({ feature, onQuit, onConfirm }: { feature: FeatureInfo; onQuit: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const quitRef = useRef<HTMLButtonElement>(null);
  const [left, setLeft] = useState(WAIT_S);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    quitRef.current?.focus();
    navigator.vibrate?.([60, 80, 60]);
    const timer = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="alerte-titre"
      aria-describedby="alerte-raison"
      onCancel={(e) => {
        e.preventDefault();
        onQuit();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md bg-transparent p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm"
    >
      <div className="rounded-3xl border-2 border-danger bg-bg p-6 text-center shadow-2xl">
        <span aria-hidden="true" className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger">
          <TriangleAlert className="size-7" />
        </span>
        <h2 id="alerte-titre" className="mt-4 text-lg font-semibold leading-snug">
          {feature.label} : pas encore le droit
        </h2>
        <p id="alerte-raison" className="mt-2 text-sm leading-relaxed text-fg-muted">
          {feature.restricted}
        </p>
        <p className="mt-2 text-sm font-medium">Si tu l&apos;allumes, tout le monde l&apos;aura.</p>

        <p aria-live="polite" className="mt-5 text-4xl font-semibold tabular-nums text-danger">
          {left > 0 ? left : 0}
        </p>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
          <button
            ref={quitRef}
            type="button"
            onClick={onQuit}
            className="btn-rose flex-1 rounded-xl px-4 py-3 text-sm font-semibold"
          >
            Quitter
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={left > 0}
            className="flex-1 rounded-xl border border-danger px-4 py-3 text-sm font-semibold text-danger transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          >
            {left > 0 ? `Activer dans ${left} s` : "Activer quand même"}
          </button>
        </div>
      </div>
    </dialog>
  );
}

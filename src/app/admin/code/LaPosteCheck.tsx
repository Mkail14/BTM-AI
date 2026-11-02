"use client";

import { useState, useTransition } from "react";
import type { LaPosteCheck as Check } from "@/lib/code-exam/laposte";
import { checkLaPosteAction } from "./actions";

const TZ = "Indian/Mayotte";
const slotFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: TZ });
const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: TZ });

/**
 * « Vérifier maintenant » : relit le site de La Poste tout de suite et montre
 * étape par étape ce qui marche et ce qui casse (sans attendre la surveillance).
 */
export function LaPosteCheck() {
  const [pending, start] = useTransition();
  const [check, setCheck] = useState<Check | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-border bg-bg p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">Lecture des horaires La Poste</h2>
        {check ? (
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${check.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>
            {check.ok ? "Fonctionne" : "En panne"}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-fg-muted">Vérifiée toutes les heures par GitHub. Tu peux aussi la lancer maintenant.</p>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const result = await checkLaPosteAction();
            if (result.ok) setCheck(result.check);
            else setError(result.message);
          })
        }
        className="mt-4 w-full rounded-xl bg-fg px-4 py-2.5 text-sm font-semibold text-bg transition hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Vérification en cours…" : "Vérifier maintenant"}
      </button>
      {error ? <p className="mt-2 text-xs text-danger">{error}</p> : null}

      {check ? (
        <div className="mt-4 space-y-3" aria-live="polite">
          <ol className="space-y-2.5">
            {check.steps.map((s) => (
              <li key={s.id} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    s.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                  }`}
                >
                  {s.ok ? "✓" : "✕"}
                </span>
                <span className="min-w-0">
                  <span className="flex justify-between gap-2 text-sm font-medium">
                    {s.label}
                    <span className="shrink-0 text-[11px] font-normal text-fg-muted tabular-nums">{(s.ms / 1000).toFixed(1)} s</span>
                  </span>
                  <span className={`block text-xs break-words ${s.ok ? "text-fg-muted" : "text-danger"}`}>{s.detail}</span>
                </span>
              </li>
            ))}
            {/* Étapes non atteintes après une panne */}
            {check.steps.length < 3 ? (
              <li className="pl-7.5 text-xs text-fg-muted">Étapes suivantes non testées.</li>
            ) : null}
          </ol>
          {check.nextSlot ? (
            <p className="rounded-xl bg-bg-subtle px-3 py-2 text-xs">
              Prochaine place libre : <span className="font-medium">{check.nextSlot.center}</span>, {slotFormat.format(new Date(check.nextSlot.startsAt))} (
              {check.nextSlot.places} place{check.nextSlot.places > 1 ? "s" : ""})
            </p>
          ) : null}
          <p className="text-[11px] text-fg-muted">
            Vérifié à {clock.format(new Date(check.at))} · {(check.durationMs / 1000).toFixed(1)} s au total
            {!check.ok ? " · à corriger dans src/lib/code-exam/laposte.ts" : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}

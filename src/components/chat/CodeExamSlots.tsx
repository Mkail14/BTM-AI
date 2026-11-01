"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CodeExamResponse } from "@/app/api/code-exam/route";

type Data = Extract<CodeExamResponse, { ok: true }>;
type Slot = Data["slots"][number];

const TZ = "Indian/Mayotte";
const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: TZ });
const dayMonth = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: TZ });
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const full = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });

const formatTime = (iso: string) => time.format(new Date(iso)).replace(":", " h ");
const formatFull = (iso: string) => `${full.format(new Date(iso))} à ${formatTime(iso)}`;
const placesLabel = (n: number) => (n === 0 ? "complet" : `${n} place${n > 1 ? "s" : ""}`);

/** Jours affichés avant « Voir plus de dates ». */
const FIRST_DAYS = 5;

function ago(at: number) {
  const minutes = Math.round((Date.now() - at) / 60_000);
  return minutes < 1 ? "à l'instant" : minutes < 60 ? `il y a ${minutes} min` : `il y a ${Math.round(minutes / 60)} h`;
}

const LINK_BUTTON = "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover";

/**
 * Tableau des horaires de l'examen du code (bureaux La Poste de Mayotte),
 * affiché par Awa dans la conversation quand on le lui demande : un bureau à
 * la fois, une ligne par jour, les heures en boutons. La réservation se
 * termine sur le site de La Poste (compte candidat).
 */
export function CodeExamSlots() {
  const [response, setResponse] = useState<CodeExamResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/code-exam", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setResponse((await res.json()) as CodeExamResponse);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    // Chargement des horaires à l'affichage du tableau.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const data = response?.ok ? response : null;
  const center = centerId ?? data?.centers[0]?.id ?? null;

  // Une ligne par jour (heure de Mayotte) pour le bureau choisi.
  const days = useMemo(() => {
    const byDay = new Map<string, Slot[]>();
    for (const slot of data?.slots ?? []) {
      if (slot.centerId !== center) continue;
      const day = dayKey.format(new Date(slot.startsAt));
      byDay.set(day, [...(byDay.get(day) ?? []), slot]);
    }
    return [...byDay.entries()];
  }, [data, center]);

  if (loadError || (response && !response.ok)) {
    return (
      <div className="rounded-2xl border border-border p-4 text-sm">
        <p className="text-fg-muted">
          {response && !response.ok ? response.message : "Impossible de charger les horaires."} Tu peux les voir directement
          sur le site de La Poste.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {/* Boutons plutôt que liens : le style des liens du message les rendrait illisibles. */}
          <button type="button" onClick={() => window.open(response?.bookingUrl ?? "https://www.lecode.laposte.fr/recherche-salle", "_blank", "noopener")} className={LINK_BUTTON}>
            Voir sur La Poste
          </button>
          <button type="button" onClick={() => void load()} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-bg-muted">
            Réessayer
          </button>
        </div>
      </div>
    );
  }
  if (!data) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-bg-subtle" aria-label="Chargement des horaires" />;
  }

  const visibleDays = showAll ? days : days.slice(0, FIRST_DAYS);
  const centerLabel = (id: string) => data.centers.find((c) => c.id === id)?.name ?? id;

  return (
    <section
      aria-label="Horaires de l'examen du code de la route"
      className="overflow-hidden rounded-2xl border border-border bg-bg text-sm leading-normal"
    >
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-subtle px-4 py-3">
        <div>
          <p className="font-semibold">Examen du code de la route</p>
          <p className="text-xs text-fg-muted">Bureaux La Poste de Mayotte · 30 prochains jours</p>
        </div>
        <span className="text-[11px] text-fg-muted">Mis à jour {ago(data.updatedAt)}</span>
      </div>

      {/* Choix du bureau */}
      <div role="tablist" aria-label="Bureau de poste" className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pt-3">
        {data.centers.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === center}
            onClick={() => {
              setCenterId(c.id);
              setPicked(null);
              setShowAll(false);
            }}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap ${
              c.id === center ? "border-accent bg-accent text-accent-fg" : "border-border hover:bg-bg-muted"
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>

      {/* Une ligne par jour : la date à gauche, les heures à droite */}
      <div className="px-4 py-3">
        {visibleDays.length === 0 ? (
          <p className="py-4 text-center text-fg-muted">Aucune session dans ce bureau sur les 30 prochains jours.</p>
        ) : (
          <div className="divide-y divide-border">
            {visibleDays.map(([day, slots]) => {
              const date = new Date(slots[0].startsAt);
              const free = slots.filter((s) => s.places > 0).length;
              return (
                <div key={day} className="grid grid-cols-[4.5rem_1fr] items-start gap-3 py-2.5 sm:grid-cols-[6rem_1fr]">
                  <div className="pt-1">
                    <p className="font-semibold capitalize">{weekday.format(date)}</p>
                    <p className="text-xs text-fg-muted">{dayMonth.format(date)}</p>
                    <p className={`mt-0.5 text-[11px] ${free > 0 ? "text-success" : "text-fg-muted"}`}>
                      {free > 0 ? `${free} session${free > 1 ? "s" : ""}` : "Complet"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {slots.map((slot) => {
                      const selected = picked?.startsAt === slot.startsAt && picked.centerId === slot.centerId;
                      const isFull = slot.places === 0;
                      return (
                        <button
                          key={slot.startsAt}
                          type="button"
                          disabled={isFull}
                          aria-pressed={selected}
                          aria-label={`${formatFull(slot.startsAt)} : ${placesLabel(slot.places)}`}
                          onClick={() => setPicked(selected ? null : slot)}
                          className={`min-w-[4.25rem] rounded-lg border px-2.5 py-1 text-xs font-medium tabular-nums pointer-coarse:py-2 ${
                            isFull
                              ? "cursor-not-allowed border-transparent bg-bg-muted text-fg-muted line-through"
                              : selected
                                ? "border-accent bg-accent text-accent-fg"
                                : "border-border hover:border-accent hover:text-accent"
                          }`}
                        >
                          <span className="block">{formatTime(slot.startsAt)}</span>
                          {!isFull ? (
                            <span className={`block text-[10px] font-normal ${selected ? "" : "text-fg-muted"}`}>
                              {placesLabel(slot.places)}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {days.length > FIRST_DAYS ? (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-1 w-full rounded-lg py-2 text-xs font-medium text-fg-muted hover:bg-bg-muted"
          >
            {showAll ? "Voir moins" : `Voir plus de dates (${days.length - FIRST_DAYS})`}
          </button>
        ) : null}
      </div>

      {/* Créneau choisi : la réservation se termine sur le site de La Poste */}
      {picked ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-bg-subtle px-4 py-3">
          <p>
            <span className="font-semibold capitalize">{formatFull(picked.startsAt)}</span>
            <span className="text-fg-muted">
              {" "}
              · {centerLabel(picked.centerId)} · {placesLabel(picked.places)}
            </span>
          </p>
          <button type="button" onClick={() => window.open(data.bookingUrl, "_blank", "noopener")} className={LINK_BUTTON}>
            Réserver sur La Poste
          </button>
        </div>
      ) : null}
    </section>
  );
}

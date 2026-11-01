"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CodeExamResponse } from "@/app/api/code-exam/route";
import { authRequiredPath } from "@/lib/auth/redirect";

type Slot = CodeExamResponse["slots"][number];

const TZ = "Indian/Mayotte";
const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: TZ });
const dayMonth = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: TZ });
const time = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const full = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });

const formatTime = (iso: string) => time.format(new Date(iso)).replace(":", " h ");
const formatFull = (iso: string) => `${full.format(new Date(iso))} à ${formatTime(iso)}`;

/** Jours affichés avant « Voir plus de dates ». */
const FIRST_DAYS = 5;

/**
 * Tableau des créneaux de l'examen du code (La Poste), affiché par Awa dans la
 * conversation quand on le lui demande : un centre à la fois, une ligne par
 * jour, les heures en boutons. Toucher une heure libre puis « Réserver ».
 */
export function CodeExamSlots() {
  const [data, setData] = useState<CodeExamResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Slot | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/code-exam", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      setData((await response.json()) as CodeExamResponse);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    // Chargement des créneaux à l'affichage du tableau.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const center = centerId ?? data?.booking?.centerId ?? data?.centers[0]?.id ?? null;

  // Une ligne par jour pour le centre choisi.
  const days = useMemo(() => {
    const byDay = new Map<string, Slot[]>();
    for (const slot of data?.slots ?? []) {
      if (slot.centerId !== center) continue;
      const day = slot.startsAt.slice(0, 10);
      byDay.set(day, [...(byDay.get(day) ?? []), slot]);
    }
    return [...byDay.entries()];
  }, [data, center]);

  async function send(method: "POST" | "DELETE", body?: object) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch("/api/code-exam", {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = (await response.json().catch(() => ({}))) as { message?: string; error?: string };
      setNotice({ ok: response.ok, text: result.message ?? result.error ?? "Le serveur n'a pas répondu." });
      if (response.ok) setPicked(null);
      await load();
    } catch {
      setNotice({ ok: false, text: "Pas de connexion : réessaie." });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-2xl border border-border p-4 text-sm text-fg-muted">
        Impossible de charger les créneaux.{" "}
        <button type="button" onClick={() => void load()} className="font-medium text-accent underline">
          Réessayer
        </button>
      </div>
    );
  }
  if (!data) {
    return <div className="h-48 animate-pulse rounded-2xl border border-border bg-bg-subtle" aria-label="Chargement des créneaux" />;
  }

  const visibleDays = showAll ? days : days.slice(0, FIRST_DAYS);
  const centerLabel = (id: string) => data.centers.find((c) => c.id === id)?.name ?? id;

  return (
    <section
      aria-label="Créneaux de l'examen du code de la route"
      className="overflow-hidden rounded-2xl border border-border bg-bg text-sm leading-normal"
    >
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg-subtle px-4 py-3">
        <div>
          <p className="font-semibold">Examen du code de la route</p>
          <p className="text-xs text-fg-muted">Centres La Poste de Mayotte</p>
        </div>
        {data.demo ? (
          <span className="rounded-full bg-warning-soft px-2.5 py-1 text-[11px] font-semibold text-warning">
            Essai : horaires fictifs
          </span>
        ) : null}
      </div>

      {/* Réservation en cours */}
      {data.booking ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-success-soft px-4 py-3">
          <p>
            <span className="font-semibold">Ta réservation :</span> {formatFull(data.booking.startsAt)}, La Poste de{" "}
            {centerLabel(data.booking.centerId)}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => window.confirm("Annuler ta réservation ?") && void send("DELETE")}
            className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
          >
            Annuler
          </button>
        </div>
      ) : null}

      {/* Choix du centre */}
      <div role="tablist" aria-label="Centre" className="scrollbar-none flex gap-1.5 overflow-x-auto px-4 pt-3">
        {data.centers.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === center}
            onClick={() => {
              setCenterId(c.id);
              setPicked(null);
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
          <p className="py-4 text-center text-fg-muted">Aucun créneau dans ce centre pour le moment.</p>
        ) : (
          <div className="divide-y divide-border">
            {visibleDays.map(([day, slots]) => {
              const date = new Date(slots[0].startsAt);
              const free = slots.filter((s) => s.status === "free").length;
              return (
                <div key={day} className="grid grid-cols-[4.5rem_1fr] items-start gap-3 py-2.5 sm:grid-cols-[6rem_1fr]">
                  <div className="pt-1">
                    <p className="font-semibold capitalize">{weekday.format(date)}</p>
                    <p className="text-xs text-fg-muted">{dayMonth.format(date)}</p>
                    <p className={`mt-0.5 text-[11px] ${free > 0 ? "text-success" : "text-fg-muted"}`}>
                      {free > 0 ? `${free} libre${free > 1 ? "s" : ""}` : "Complet"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {slots.map((slot) => {
                      const selected = picked?.startsAt === slot.startsAt && picked.centerId === slot.centerId;
                      return (
                        <button
                          key={slot.startsAt}
                          type="button"
                          disabled={slot.status !== "free" || busy}
                          aria-pressed={selected}
                          aria-label={`${formatFull(slot.startsAt)} : ${
                            slot.status === "mine" ? "ta réservation" : slot.status === "full" ? "complet" : "libre"
                          }`}
                          onClick={() => {
                            setNotice(null);
                            setPicked(selected ? null : slot);
                          }}
                          className={`min-w-[4.25rem] rounded-lg border px-2.5 py-1.5 text-xs font-medium tabular-nums pointer-coarse:py-2.5 ${
                            slot.status === "mine"
                              ? "border-success bg-success text-white"
                              : slot.status === "full"
                                ? "cursor-not-allowed border-transparent bg-bg-muted text-fg-muted line-through"
                                : selected
                                  ? "border-accent bg-accent text-accent-fg"
                                  : "border-border hover:border-accent hover:text-accent"
                          }`}
                        >
                          {formatTime(slot.startsAt)}
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

      {/* Confirmation */}
      {picked || notice ? (
        <div className="border-t border-border bg-bg-subtle px-4 py-3">
          {picked ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                <span className="font-semibold capitalize">{formatFull(picked.startsAt)}</span>
                <span className="text-fg-muted"> · La Poste de {centerLabel(picked.centerId)}</span>
              </p>
              {data.signedIn ? (
                <button
                  type="button"
                  disabled={busy || Boolean(data.booking)}
                  title={data.booking ? "Annule d'abord ta réservation actuelle" : undefined}
                  onClick={() => void send("POST", { centerId: picked.centerId, startsAt: picked.startsAt })}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
                >
                  {busy ? "Réservation…" : "Réserver"}
                </button>
              ) : (
                // Bouton plutôt que lien : le style des liens du message le rendrait illisible.
                <button
                  type="button"
                  onClick={() => window.location.assign(authRequiredPath(window.location.pathname))}
                  className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover"
                >
                  Se connecter pour réserver
                </button>
              )}
            </div>
          ) : null}
          {notice ? (
            <p role={notice.ok ? "status" : "alert"} className={`text-xs ${picked ? "mt-2" : ""} ${notice.ok ? "text-success" : "text-danger"}`}>
              {notice.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

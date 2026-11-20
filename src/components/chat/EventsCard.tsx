"use client";

import { CalendarDays, ChevronRight, MapPin, MonitorSmartphone } from "lucide-react";
import { useEffect, useState } from "react";
import type { EventsResponse, JobEvent } from "@/lib/emploi/events";

const PERSONA = "var(--persona,var(--accent))";
/** Événements montrés d'abord ; « Voir tout » montre le reste. */
const FIRST = 4;

type State = { status: "loading" } | { status: "ok"; events: JobEvent[] } | { status: "off" } | { status: "error"; message: string };

const tz = "Indian/Mayotte";
const dayKey = new Intl.DateTimeFormat("fr-CA", { timeZone: tz });
const dayName = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: tz });
const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: tz });

/** « Aujourd'hui 9:00 », « Demain 8:30 », « jeu. 26 nov. 8:30 » (heure de Mayotte). */
function whenOf(iso: string) {
  const date = new Date(iso);
  const today = dayKey.format(new Date());
  const tomorrow = dayKey.format(new Date(Date.now() + 86_400_000));
  const day = dayKey.format(date);
  const label = day === today ? "Aujourd'hui" : day === tomorrow ? "Demain" : dayName.format(date);
  return `${label} · ${clock.format(date)}`;
}

/**
 * Événements emploi dans la conversation (bloc ```evenements-emploi```) : les prochains
 * job datings, réunions d'information et ateliers à Mayotte, chacun avec son lien d'inscription.
 */
export function EventsCard() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [all, setAll] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/emploi/evenements")
      .then(async (res) => ((await res.json().catch(() => null)) as EventsResponse | null) ?? { error: "Événements indisponibles." })
      .then((body) => {
        if (!alive) return;
        if ("error" in body) return setState({ status: "error", message: body.error });
        if (!body.configured) return setState({ status: "off" });
        setState({ status: "ok", events: body.events });
      })
      .catch(() => alive && setState({ status: "error", message: "Événements indisponibles : vérifie ta connexion." }));
    return () => {
      alive = false;
    };
  }, []);

  const events = state.status === "ok" ? state.events : [];
  const shown = all ? events : events.slice(0, FIRST);
  const line =
    state.status === "loading"
      ? "Je regarde les prochains événements…"
      : state.status === "ok"
        ? events.length
          ? `${events.length} à venir à Mayotte`
          : "Rien de prévu pour l'instant"
        : state.status === "off"
          ? "Bientôt disponible"
          : state.message;

  return (
    <div className="booking-step carte-cadre w-full p-4">
      <div className="flex items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: PERSONA }}>
          <CalendarDays aria-hidden="true" className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">Événements emploi</span>
          <span className="block text-xs text-fg-muted">{line}</span>
        </span>
      </div>
      {shown.length ? (
        <ul className="mt-3 space-y-2">
          {shown.map((e) => (
            <li key={e.id}>
              <a href={e.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-2xl bg-bg-subtle px-3 py-2.5 hover:bg-border">
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold" style={{ color: PERSONA }}>
                    {whenOf(e.start)}
                  </span>
                  <span className="line-clamp-2 text-sm leading-snug font-semibold">{e.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-fg-muted">
                    <span>{e.type}</span>
                    <span className="inline-flex items-center gap-1">
                      {e.remote ? <MonitorSmartphone aria-hidden="true" className="size-3" /> : <MapPin aria-hidden="true" className="size-3" />}
                      {e.remote ? "À distance" : e.town}
                    </span>
                    {e.placesLeft !== null ? <span>{e.placesLeft > 0 ? `${e.placesLeft} places` : "Complet"}</span> : null}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold">
                  S&apos;inscrire
                  <ChevronRight aria-hidden="true" className="size-4" />
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {events.length > FIRST ? (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 w-full rounded-full border border-border px-3 py-2 text-xs font-semibold hover:bg-bg-subtle">
          {all ? "Voir moins" : `Voir tout (${events.length})`}
        </button>
      ) : null}
      {state.status === "ok" && events.length ? <p className="mt-2 text-center text-[10px] text-fg-muted">France Travail · Mes évènements emploi</p> : null}
    </div>
  );
}

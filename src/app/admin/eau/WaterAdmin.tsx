"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { ActionStatus, Field, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconArrowDown, IconArrowLeft, IconClose, IconExternal, IconPlus, IconRetry } from "@/components/ui/icons";
import type { ActionResult } from "@/server/middlewares/admin-auth";
import { mayotteDate, sectorNow, type DayCell, type WaterAlert, type WaterPlanning } from "@/lib/water/schedule";
import { addAlertAction, readSmaeAction, removeAlertAction } from "./actions";

/**
 * Page « Tours d'eau » en un seul écran : planning en service (une semaine à la fois), état de
 * chaque secteur maintenant, coupures hors planning. Villages d'un secteur et ajout d'une
 * coupure dans une fenêtre, pour que rien ne fasse défiler la page.
 */

const up = <IconArrowDown width={13} height={13} className="rotate-180" aria-hidden="true" />;
const down = <IconArrowDown width={13} height={13} aria-hidden="true" />;

const CELL: Record<DayCell, { icon: ReactNode; text: string; label: string; className: string }> = {
  ouverture: { icon: up, text: "10 h", label: "Ouverture à 10 h", className: "bg-success-soft text-success" },
  fermeture: { icon: down, text: "16 h", label: "Fermeture à 16 h", className: "bg-danger-soft text-danger" },
  ferme: { icon: null, text: "Fermé", label: "Fermé toute la journée", className: "bg-danger text-danger-fg" },
  journee: { icon: null, text: "7–17 h", label: "Ouvert de 7 h à 17 h", className: "bg-success-soft text-success" },
};

const dayFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Indian/Mayotte" });
const shortTime = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });
const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "Indian/Mayotte" });

/** Prochain changement en peu de mots : « 16 h », « dem. 10 h » (demain), « ven. 10 h ». */
function soon(at: number, now: number): string {
  const hour = `${(new Date(at).getUTCHours() + 3) % 24} h`;
  if (mayotteDate(at) === mayotteDate(now)) return hour;
  if (mayotteDate(at) === mayotteDate(now + 86_400_000)) return `dem. ${hour}`;
  return `${weekday.format(new Date(at))} ${hour}`;
}
const utcDate = (date: string) => new Date(`${date}T00:00:00Z`);

/** Fenêtre : feuille qui monte du bas sur téléphone, centrée sur ordinateur (style des confirmations). */
function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-label={title}
      className="confirm-dialog m-0 mt-auto w-full max-w-none bg-transparent p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-md"
    >
      <div className="confirm-dialog-panel max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-border bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-fg-muted hover:bg-bg-muted hover:text-fg">
            <IconClose width={18} height={18} />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </dialog>
  );
}

function SectorTiles({ planning, now, onOpen }: { planning: WaterPlanning; now: number; onOpen: (id: string) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {planning.sectors.map((s) => {
        const state = sectorNow(planning, s.id, now);
        const tone = state.state === "eau" ? "text-success" : state.state === "coupee" ? "text-danger" : "text-fg-muted";
        const dot = state.state === "eau" ? "bg-success" : state.state === "coupee" ? "bg-danger" : "bg-border";
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onOpen(s.id)}
            className="min-w-0 rounded-xl border border-border bg-bg px-2.5 py-2 text-left hover:border-accent"
            title={`Voir les ${s.villages.length} lieux du secteur ${s.id}`}
          >
            <span className="block text-xs text-fg-muted">Secteur {s.id}</span>
            <span className={`mt-0.5 flex items-center gap-1.5 text-sm font-semibold ${tone}`}>
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
              {state.state === "eau" ? "Eau" : state.state === "coupee" ? "Coupée" : "?"}
            </span>
            <span className="mt-0.5 flex items-center gap-0.5 overflow-hidden whitespace-nowrap text-[11px] leading-tight text-fg-muted">
              {state.next ? <>{state.next.on ? up : down} {soon(state.next.at, now)}</> : "—"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WeekGrid({ planning, now }: { planning: WaterPlanning; now: number }) {
  const today = mayotteDate(now);
  const weeks: WaterPlanning["days"][] = [];
  for (let i = 0; i < planning.days.length; i += 7) weeks.push(planning.days.slice(i, i + 7));
  const current = Math.max(0, weeks.findIndex((w) => w.some((d) => d.date === today)));
  const [index, setIndex] = useState(current);
  const week = weeks[index] ?? [];
  const nav = "grid size-8 place-items-center rounded-lg border border-border hover:bg-bg-muted disabled:opacity-40";

  return (
    <section className="flex min-h-72 flex-1 flex-col rounded-xl border border-border bg-bg p-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={nav} disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Semaine précédente">
          <IconArrowLeft width={15} height={15} />
        </button>
        <p className="text-sm font-medium">
          {week.length ? `Semaine du ${shortDate.format(utcDate(week[0].date))} au ${shortDate.format(utcDate(week[week.length - 1].date))}` : "—"}
          <span className="ml-1.5 text-xs font-normal text-fg-muted">
            {index + 1}/{weeks.length}
          </span>
        </p>
        <button type="button" className={nav} disabled={index >= weeks.length - 1} onClick={() => setIndex(index + 1)} aria-label="Semaine suivante">
          <IconArrowLeft width={15} height={15} className="rotate-180" />
        </button>
      </div>

      <div role="table" aria-label="Planning de la semaine" className="mt-2 grid min-h-0 flex-1 grid-cols-[3.75rem_repeat(4,minmax(0,1fr))] auto-rows-fr gap-1 text-sm">
        <div role="row" className="contents">
          <span role="columnheader" />
          {planning.sectors.map((s) => (
            <span key={s.id} role="columnheader" className="self-end pb-0.5 text-center text-xs font-medium text-fg-muted">
              S{s.id}
            </span>
          ))}
        </div>
        {week.map((day) => {
          const isToday = day.date === today;
          return (
            <div key={day.date} role="row" className="contents">
              <span role="rowheader" className={`flex items-center rounded-md px-1.5 text-xs capitalize ${isToday ? "bg-accent-soft font-semibold text-fg" : "text-fg-muted"}`}>
                {dayFormat.format(utcDate(day.date))}
              </span>
              {planning.sectors.map((s) => {
                const cell = day.cells[s.id];
                const look = cell ? CELL[cell] : null;
                return (
                  <span
                    key={s.id}
                    role="cell"
                    title={look?.label ?? "Pas lu"}
                    className={`flex min-h-7 items-center justify-center gap-1 rounded-md text-xs font-medium ${look ? look.className : "bg-bg-muted text-fg-muted"} ${isToday ? "ring-2 ring-accent/60" : ""}`}
                  >
                    {look?.icon}
                    {look ? look.text : "?"}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-fg-muted">
        <span className="inline-flex items-center gap-1 text-success">{up} ouverture</span>
        <span className="inline-flex items-center gap-1 text-danger">{down} fermeture</span>
        <span>Fermé : toute la journée</span>
        <span className="max-sm:hidden">S4 : zones industrielles</span>
      </p>
    </section>
  );
}

export function WaterAdmin({ planning, alerts, unplaced, now }: { planning: WaterPlanning | null; alerts: WaterAlert[]; unplaced: string[]; now: number }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [sector, setSector] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [places, setPlaces] = useState("");
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await action().catch(() => ({ ok: false, message: "Connexion perdue : réessaie." }) as ActionResult);
      setResult(r);
      if (r.ok) after?.();
    });
  const open = planning?.sectors.find((s) => s.id === sector) ?? null;
  const link = "font-medium text-fg underline-offset-2 hover:underline";

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Tours d&apos;eau</h1>
          <p className="mt-0.5 text-xs text-fg-muted sm:text-sm">
            {planning ? (
              <>
                Du {shortDate.format(utcDate(planning.from))} au {shortDate.format(utcDate(planning.to))} · lu le {timeFormat.format(new Date(planning.readAt))}
                {planning.source ? (
                  <>
                    {" · "}
                    <a href={planning.source} target="_blank" rel="noreferrer" className={`${link} inline-flex items-center gap-0.5`}>
                      SMAE <IconExternal width={11} height={11} />
                    </a>
                  </>
                ) : null}
                {planning.images.length ? (
                  <>
                    {" · images "}
                    {planning.images.map((src, i) => (
                      <a key={src} href={src} target="_blank" rel="noreferrer" className={`${link} px-0.5`}>
                        {i + 1}
                      </a>
                    ))}
                  </>
                ) : null}
              </>
            ) : (
              "Pas encore lu : toute la carte est hachurée."
            )}
          </p>
        </div>
        <button type="button" disabled={pending} onClick={() => run(readSmaeAction)} className={`${secondaryButton} inline-flex shrink-0 items-center gap-1.5`}>
          <IconRetry width={15} height={15} className={pending ? "animate-spin" : ""} />
          {pending ? "Lecture…" : "Relire"}
        </button>
      </div>
      <p className="-mt-1 text-xs text-fg-muted [@media(max-height:720px)]:hidden">Lu tout seul sur le site de la SMAE, sans IA, à 6 h et 18 h. Toucher un secteur pour voir ses lieux.</p>
      <ActionStatus result={result} />
      {unplaced.length ? (
        <p className="truncate rounded-lg bg-warning-soft px-3 py-1.5 text-xs [@media(max-height:720px)]:hidden" title={unplaced.join(", ")}>
          Pas encore sur la carte : {unplaced.join(", ")}
        </p>
      ) : null}

      {planning ? (
        <>
          <SectorTiles planning={planning} now={now} onOpen={setSector} />
          <WeekGrid planning={planning} now={now} />
        </>
      ) : null}

      <section className="flex items-center gap-2 rounded-xl border border-border bg-bg px-3 py-2">
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-medium">Coupures hors planning : </span>
          {alerts.length ? (
            <span className="inline-flex flex-wrap gap-1.5 align-middle">
              {alerts.map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1 rounded-full bg-danger-soft py-0.5 pl-2.5 pr-1 text-xs text-danger" title={`Jusqu'au ${timeFormat.format(new Date(a.until))}${a.note ? ` · ${a.note}` : ""}`}>
                  {a.places.join(", ")} · {shortTime.format(new Date(a.until))}
                  <button type="button" disabled={pending} onClick={() => run(() => removeAlertAction(a.id))} aria-label="Retirer cette coupure" className="rounded-full p-0.5 hover:bg-danger/15">
                    <IconClose width={12} height={12} />
                  </button>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-fg-muted">aucune</span>
          )}
        </div>
        <button type="button" onClick={() => setAdding(true)} className={`${secondaryButton} inline-flex shrink-0 items-center gap-1`}>
          <IconPlus width={15} height={15} /> Ajouter
        </button>
      </section>

      <Sheet open={open !== null} onClose={() => setSector(null)} title={open ? `Secteur ${open.id} · ${open.villages.length} lieux` : "Secteur"}>
        <ul className="columns-2 gap-4 text-sm">
          {open?.villages.map((v) => (
            <li key={v} className={`break-inside-avoid py-0.5 ${unplaced.includes(v) ? "text-warning" : ""}`}>
              {v}
            </li>
          ))}
        </ul>
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="Coupure hors planning">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addAlertAction({ places, until, note }), () => (setPlaces(""), setUntil(""), setNote(""), setAdding(false)));
          }}
        >
          <Field label="Lieux" hint="Comme sur le planning, séparés par des virgules : Koungou village, Kawéni village.">
            <input value={places} onChange={(e) => setPlaces(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Jusqu'à (heure de Mayotte)">
            <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Raison (facultatif)">
            <input value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} placeholder="Incident électrique" className={inputClass} />
          </Field>
          {result && !result.ok ? <ActionStatus result={result} /> : null}
          <button type="submit" disabled={pending} className={`${primaryButton} w-full`}>
            Ajouter la coupure
          </button>
        </form>
      </Sheet>
    </>
  );
}

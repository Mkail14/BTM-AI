"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CodeExamResponse } from "@/app/api/code-exam/route";
import { IconExternal } from "@/components/ui/icons";
import { formatWhenDay, readCodeExamBlock, type Moment } from "@/lib/code-exam/when";
import { BookingDialog } from "./BookingDialog";
import { ChoiceOption as Option } from "./ChoiceOption";

type Data = Extract<CodeExamResponse, { ok: true }>;
type Slot = Data["slots"][number];

const TZ = "Indian/Mayotte";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const dayLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const dayShort = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const hourOf = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: TZ });

/** « Mtsapéré-Mamoudzou » → « mtsapere mamoudzou » : pour retrouver le bureau nommé par Tamilya. */
const simplify = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const formatTime = (iso: string) => clock.format(new Date(iso)).replace(":", " h ");
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;
const inMoment = (s: Slot, moment: Moment) => (Number(hourOf.format(new Date(s.startsAt))) < 12) === (moment === "matin");
/** Écart en jours entre deux jours « 2026-11-03 ». */
const gap = (a: string, b: string) => Math.abs(Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000;

/** « demain », « aujourd'hui », sinon « mardi 3 novembre ». */
function dayName(day: string) {
  const today = dayKey.format(new Date());
  const d = gap(day, today);
  if (day === today) return "aujourd'hui";
  if (d === 1 && day > today) return "demain";
  return formatWhenDay(day);
}

/** Jours proposés avant « Autres dates ». */
const FIRST_DAYS = 5;
const PERSONA = "var(--persona,var(--accent))";

/**
 * Horaires de l'examen du code (bureaux La Poste de Mayotte), affichés par
 * Tamilya dans la conversation quand on les lui demande. Une question à la fois :
 * la ville, puis le jour, puis l'heure ; les informations du candidat se donnent dans la fenêtre
 * de réservation (BookingDialog). Seules les sessions avec des places sont proposées.
 *
 * Le bloc peut préciser le jour et le moment voulus (« jour: 2026-11-03 »,
 * « moment: matin », ajoutés par le serveur) : le tableau s'ouvre directement
 * sur ce jour, ou dit qu'il est complet et propose les jours les plus proches.
 */
export function CodeExamSlots({ office: block = "" }: { office?: string }) {
  const { office, when } = useMemo(() => readCodeExamBlock(block), [block]);
  const [response, setResponse] = useState<CodeExamResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [moreDays, setMoreDays] = useState(false);
  const [booking, setBooking] = useState(false);
  // Le jour demandé n'est appliqué tout seul qu'une fois : « Retour » montre ensuite tous les jours.
  const [wantedDone, setWantedDone] = useState(false);
  // Moment demandé (matin / après-midi) : « Tout voir » l'enlève.
  const [momentOff, setMomentOff] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/code-exam", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as CodeExamResponse;
      setResponse(body);
      // Bureau nommé par Tamilya : ouvert directement (sinon, choix de la ville).
      const wanted = simplify(office);
      const found = wanted && body.ok ? body.centers.find((c) => simplify(c.name).includes(wanted) || wanted.includes(simplify(c.name))) : null;
      if (found) setCenterId(found.id);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [office]);

  useEffect(() => {
    // Chargement des horaires à l'affichage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const data = response?.ok ? response : null;

  // Sessions avec des places, par bureau puis par jour (heure de Mayotte).
  const byCenter = useMemo(() => {
    const map = new Map<string, Map<string, Slot[]>>();
    for (const s of data?.slots ?? []) {
      if (s.places <= 0) continue;
      const days = map.get(s.centerId) ?? new Map<string, Slot[]>();
      const key = dayKey.format(new Date(s.startsAt));
      days.set(key, [...(days.get(key) ?? []), s]);
      map.set(s.centerId, days);
    }
    return map;
  }, [data]);

  const bookingUrl = response?.bookingUrl ?? "https://www.lecode.laposte.fr/recherche-salle";
  const openLaPoste = () => window.open(bookingUrl, "_blank", "noopener");

  const shell = (children: ReactNode) => (
    <section
      aria-label="Horaires de l'examen du code de la route"
      className="max-w-md overflow-hidden rounded-2xl border border-border bg-bg p-1.5 text-sm leading-normal shadow-sm"
    >
      {children}
    </section>
  );

  if (loadError || (response && !response.ok)) {
    return shell(
      <div className="p-2.5">
        <p className="text-fg-muted">Les horaires ne sont pas disponibles pour le moment.</p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={openLaPoste}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 font-medium text-white hover:brightness-110"
            style={{ background: PERSONA }}
          >
            Voir sur La Poste <IconExternal width={14} height={14} />
          </button>
          <button type="button" onClick={() => void load()} className="rounded-full px-4 py-2 font-medium hover:bg-bg-muted">
            Réessayer
          </button>
        </div>
      </div>,
    );
  }
  if (!data) {
    return shell(<div className="h-56 animate-pulse rounded-xl bg-bg-subtle" aria-label="Chargement des horaires" />);
  }

  const wantedDay = !wantedDone ? when.day : null;
  const moment = momentOff ? null : when.moment;
  const center = data.centers.find((c) => c.id === centerId) ?? null;
  const centerDays = center ? (byCenter.get(center.id) ?? new Map<string, Slot[]>()) : new Map<string, Slot[]>();
  // Jour demandé avec des places : ouvert directement.
  const shownDay = day ?? (wantedDay && centerDays.has(wantedDay) ? wantedDay : null);
  // Jour demandé complet : les jours les plus proches d'abord.
  const wantedFull = Boolean(center && wantedDay && !centerDays.has(wantedDay));
  const days = [...centerDays.entries()].sort(([a], [b]) => (wantedFull && wantedDay ? gap(a, wantedDay) - gap(b, wantedDay) || a.localeCompare(b) : a.localeCompare(b)));
  const allTimes = center && shownDay ? (centerDays.get(shownDay) ?? []) : [];
  const momentTimes = moment ? allTimes.filter((s) => inMoment(s, moment)) : allTimes;
  const times = momentTimes.length ? momentTimes : allTimes;

  const step = !center ? 1 : !shownDay ? 2 : !slot ? 3 : 4;
  const back = () => {
    if (slot) setSlot(null);
    else if (shownDay) {
      setDay(null);
      setWantedDone(true);
    } else {
      setCenterId(null);
      setMoreDays(false);
    }
  };

  const question = ["Dans quelle ville ?", "Quel jour ?", "À quelle heure ?", "C'est noté"][step - 1];
  // Ce qui a déjà été choisi, rappelé sous la question.
  const recap = [center?.name, shownDay && capitalize(dayShort.format(new Date(allTimes[0]?.startsAt ?? shownDay)))].filter(Boolean).join(" · ");

  // Villes : avec un jour demandé, celles qui ont de la place ce jour-là d'abord.
  const cities = data.centers
    .map((c) => {
      const cDays = byCenter.get(c.id);
      const total = [...(cDays?.values() ?? [])].flat().length;
      const onDay = wantedDay ? (cDays?.get(wantedDay)?.length ?? 0) : 0;
      return { c, total, onDay };
    })
    .sort((a, b) => (wantedDay ? b.onDay - a.onDay : 0));

  return shell(
    <>
      {/* Question en cours */}
      <div className="flex items-center gap-2 px-3 pt-2 pb-1.5">
        {step > 1 ? (
          <button
            type="button"
            onClick={back}
            aria-label="Retour"
            className="-ml-1.5 grid size-7 place-items-center rounded-full text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            ‹
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{question}</p>
          {recap ? <p className="truncate text-xs text-fg-muted">{recap}</p> : null}
        </div>
        <span className="text-xs text-fg-muted tabular-nums">{Math.min(step, 3)}/3</span>
      </div>

      {/* 1. Ville */}
      {step === 1 ? (
        <>
          {wantedDay ? (
            <p className="mx-1.5 mb-1 rounded-xl bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
              Places pour <span className="font-semibold text-fg">{dayName(wantedDay)}</span>
              {moment ? ` (${moment === "matin" ? "le matin" : "l'après-midi"})` : ""} :
            </p>
          ) : null}
          {cities.map(({ c, total, onDay }, i) => (
            <Option
              key={c.id}
              index={i + 1}
              label={c.name}
              hint={wantedDay ? (onDay > 0 ? `${plural(onDay, "horaire")} ${dayName(wantedDay)}` : total > 0 ? "complet ce jour-là" : "complet") : total > 0 ? plural(total, "horaire") : "complet"}
              onClick={() => setCenterId(c.id)}
            />
          ))}
        </>
      ) : null}

      {/* 2. Jour */}
      {step === 2 ? (
        days.length === 0 ? (
          <p className="px-3 py-4 text-fg-muted">Plus de place dans ce bureau ce mois-ci. Choisis une autre ville.</p>
        ) : (
          <>
            {wantedFull && wantedDay ? (
              <p role="status" className="mx-1.5 mb-1 rounded-xl bg-warning-soft px-3 py-2 text-xs">
                Plus de place <span className="font-semibold">{dayName(wantedDay)}</span> à {center?.name}. Voici les jours les plus proches :
              </p>
            ) : null}
            {(moreDays ? days : days.slice(0, FIRST_DAYS)).map(([key, slots], i) => (
              <Option
                key={key}
                index={i + 1}
                label={capitalize(dayLong.format(new Date(slots[0].startsAt)))}
                hint={plural(slots.length, "horaire")}
                onClick={() => setDay(key)}
              />
            ))}
            {!moreDays && days.length > FIRST_DAYS ? (
              <button
                type="button"
                onClick={() => setMoreDays(true)}
                className="w-full rounded-xl px-3 py-2 text-left text-xs font-medium text-fg-muted hover:bg-bg-muted"
              >
                Autres dates ({days.length - FIRST_DAYS})
              </button>
            ) : null}
          </>
        )
      ) : null}

      {/* 3. Heure */}
      {step === 3 ? (
        <>
          {moment ? (
            <p className="mx-1.5 mb-1 flex items-center justify-between gap-2 rounded-xl bg-bg-subtle px-3 py-2 text-xs text-fg-muted">
              <span>
                {momentTimes.length
                  ? moment === "matin"
                    ? "Horaires du matin"
                    : "Horaires de l'après-midi"
                  : moment === "matin"
                    ? "Pas d'horaire le matin ce jour-là : voici les autres"
                    : "Pas d'horaire l'après-midi ce jour-là : voici les autres"}
              </span>
              {momentTimes.length && momentTimes.length < allTimes.length ? (
                <button type="button" onClick={() => setMomentOff(true)} className="font-semibold text-fg hover:underline">
                  Tout voir
                </button>
              ) : null}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 px-3 pt-1 pb-2.5">
            {times.map((s) => (
              <button
                key={s.startsAt}
                type="button"
                onClick={() => setSlot(s)}
                className="rounded-full border border-border px-4 py-2 font-medium tabular-nums transition-colors hover:border-[var(--persona,var(--accent))] hover:text-[var(--persona,var(--accent))]"
              >
                {formatTime(s.startsAt)}
                <span className="ml-1.5 text-xs font-normal text-fg-muted">{plural(s.places, "place")}</span>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {/* 4. Récapitulatif : les informations du candidat se donnent dans la fenêtre de réservation */}
      {step === 4 && slot && center ? (
        <div className="px-3 pt-1 pb-2.5">
          <p className="text-base font-medium">
            {capitalize(dayLong.format(new Date(slot.startsAt)))} à {formatTime(slot.startsAt)}
          </p>
          <p className="text-fg-muted">La Poste de {center.name}</p>
          <button
            type="button"
            onClick={() => setBooking(true)}
            className="mt-3 w-full rounded-full px-4 py-2.5 font-medium text-white transition hover:brightness-110 active:scale-[0.99]"
            style={{ background: PERSONA }}
          >
            Réserver cette place
          </button>
        </div>
      ) : null}

      {booking && slot && center ? (
        <BookingDialog
          slot={{
            centerId: center.id,
            centerName: center.name,
            startsAt: slot.startsAt,
            types: center.types,
            when: `${capitalize(dayShort.format(new Date(slot.startsAt)))} à ${formatTime(slot.startsAt)}`,
          }}
          onClose={() => setBooking(false)}
        />
      ) : null}
    </>,
  );
}

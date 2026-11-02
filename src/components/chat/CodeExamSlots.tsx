"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CodeExamResponse } from "@/app/api/code-exam/route";
import { IconExternal } from "@/components/ui/icons";
import { BookingDialog } from "./BookingDialog";
import { ChoiceOption as Option } from "./ChoiceOption";

type Data = Extract<CodeExamResponse, { ok: true }>;
type Slot = Data["slots"][number];

const TZ = "Indian/Mayotte";
const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const dayLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const dayShort = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const clock = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });

/** « Mtsapéré-Mamoudzou » → « mtsapere mamoudzou » : pour retrouver le bureau nommé par Awa. */
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

/** Jours proposés avant « Autres dates ». */
const FIRST_DAYS = 5;
const PERSONA = "var(--persona,var(--accent))";

/**
 * Horaires de l'examen du code (bureaux La Poste de Mayotte), affichés par
 * Awa dans la conversation quand on les lui demande. Une question à la fois :
 * la ville, puis le jour, puis l'heure ; les informations du candidat se donnent dans la fenêtre
 * de réservation (BookingDialog). Seules les sessions avec des places sont proposées.
 */
export function CodeExamSlots({ office = "" }: { office?: string }) {
  const [response, setResponse] = useState<CodeExamResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [centerId, setCenterId] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [moreDays, setMoreDays] = useState(false);
  const [booking, setBooking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/code-exam", { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as CodeExamResponse;
      setResponse(body);
      // Bureau nommé par Awa : ouvert directement (sinon, choix de la ville).
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

  const center = data.centers.find((c) => c.id === centerId) ?? null;
  const days = center ? [...(byCenter.get(center.id) ?? new Map()).entries()] : [];
  const times = center && day ? (byCenter.get(center.id)?.get(day) ?? []) : [];

  const step = !center ? 1 : !day ? 2 : !slot ? 3 : 4;
  const back = () => {
    if (slot) setSlot(null);
    else if (day) setDay(null);
    else {
      setCenterId(null);
      setMoreDays(false);
    }
  };

  const question = ["Dans quelle ville ?", "Quel jour ?", "À quelle heure ?", "C'est noté"][step - 1];
  // Ce qui a déjà été choisi, rappelé sous la question.
  const recap = [center?.name, day && capitalize(dayShort.format(new Date(times[0]?.startsAt ?? day)))].filter(Boolean).join(" · ");

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
      {step === 1
        ? data.centers.map((c, i) => {
            const count = [...(byCenter.get(c.id)?.values() ?? [])].flat().length;
            return (
              <Option
                key={c.id}
                index={i + 1}
                label={c.name}
                hint={count > 0 ? plural(count, "horaire") : "complet"}
                onClick={() => setCenterId(c.id)}
              />
            );
          })
        : null}

      {/* 2. Jour */}
      {step === 2 ? (
        days.length === 0 ? (
          <p className="px-3 py-4 text-fg-muted">Plus de place dans ce bureau ce mois-ci. Choisis une autre ville.</p>
        ) : (
          <>
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
        <div className="flex flex-wrap gap-2 px-3 pt-1 pb-2.5">
          {times.map((s) => (
            <button
              key={s.startsAt}
              type="button"
              onClick={() => setSlot(s)}
              className="rounded-full border border-border px-4 py-2 font-medium tabular-nums transition-colors hover:border-[var(--persona,var(--accent))] hover:text-[var(--persona,var(--accent))]"
            >
              {formatTime(s.startsAt)}
            </button>
          ))}
        </div>
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

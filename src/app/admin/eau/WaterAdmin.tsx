"use client";

import { useState, useTransition } from "react";
import { ActionStatus, AdminCard, Field, inputClass, secondaryButton } from "@/components/admin/form";
import type { ActionResult } from "@/server/middlewares/admin-auth";
import type { DayCell, WaterAlert, WaterPlanning } from "@/lib/water/schedule";
import { addAlertAction, readSmaeAction, removeAlertAction } from "./actions";

const CELL: Record<DayCell, { text: string; className: string }> = {
  ouverture: { text: "Ouverture 10 h", className: "text-success" },
  fermeture: { text: "Fermeture 16 h", className: "text-danger" },
  ferme: { text: "Fermé", className: "text-danger font-semibold" },
  journee: { text: "7 h – 17 h", className: "text-success" },
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Indian/Mayotte" });

function PlanningTable({ planning, unplaced }: { planning: WaterPlanning; unplaced: string[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-fg-muted">
        Du {planning.from} au {planning.to} · lu le {timeFormat.format(new Date(planning.readAt))}
        {planning.source ? (
          <>
            {" · "}
            <a href={planning.source} target="_blank" rel="noreferrer" className="font-medium text-fg underline-offset-2 hover:underline">
              page de la SMAE
            </a>
          </>
        ) : null}
      </p>
      {planning.images.length ? (
        <div className="flex flex-wrap gap-2">
          {planning.images.map((src, i) => (
            <a key={src} href={src} target="_blank" rel="noreferrer" className={secondaryButton}>
              Image {i + 1}
            </a>
          ))}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-bg-subtle text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Jour</th>
              {planning.sectors.map((s) => (
                <th key={s.id} className="px-3 py-2 font-medium">
                  Secteur {s.id}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {planning.days.map((day) => (
              <tr key={day.date}>
                <td className="px-3 py-1.5 whitespace-nowrap">{dateFormat.format(new Date(`${day.date}T00:00:00Z`))}</td>
                {planning.sectors.map((s) => {
                  const cell = day.cells[s.id];
                  return (
                    <td key={s.id} className={`px-3 py-1.5 whitespace-nowrap ${cell ? CELL[cell].className : "text-fg-muted"}`}>
                      {cell ? CELL[cell].text : "?"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {planning.sectors.map((s) => (
          <details key={s.id} className="rounded-lg border border-border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">
              Secteur {s.id} · {s.villages.length} lieux
            </summary>
            <p className="mt-2 text-fg-muted">{s.villages.join(", ")}</p>
          </details>
        ))}
      </div>
      {unplaced.length ? (
        <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
          Pas encore placés sur la carte (hachurés à la place) : {unplaced.join(", ")}. À ajouter dans src/lib/water/zones.ts.
        </p>
      ) : null}
    </div>
  );
}

export function WaterAdmin({ planning, alerts, unplaced }: { planning: WaterPlanning | null; alerts: WaterAlert[]; unplaced: string[] }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [places, setPlaces] = useState("");
  const [until, setUntil] = useState("");
  const [note, setNote] = useState("");
  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const r = await action().catch(() => ({ ok: false, message: "Connexion perdue : réessaie." }) as ActionResult);
      setResult(r);
      if (r.ok) after?.();
    });

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tours d&apos;eau</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Planning officiel de la SMAE, lu par Gemini sur mahoraisedeseaux.com et mis sur la carte tout seul : le site regarde toutes les heures si un
          nouveau planning est annoncé.
        </p>
      </div>
      <ActionStatus result={result} />

      <AdminCard
        title="Planning utilisé par la carte"
        aside={
          <button type="button" disabled={pending} onClick={() => run(readSmaeAction)} className={secondaryButton}>
            {pending ? "Lecture… (1 à 2 min)" : "Relire maintenant"}
          </button>
        }
      >
        {planning ? <PlanningTable planning={planning} unplaced={unplaced} /> : <p className="text-sm text-fg-muted">Pas encore lu : toute la carte est hachurée.</p>}
      </AdminCard>

      <AdminCard title="Coupures annoncées hors planning">
        <div className="space-y-4">
          {alerts.length ? (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.places.join(", ")}</p>
                    <p className="text-fg-muted">
                      Jusqu&apos;au {timeFormat.format(new Date(a.until))}
                      {a.note ? ` · ${a.note}` : ""}
                    </p>
                  </div>
                  <button type="button" disabled={pending} onClick={() => run(() => removeAlertAction(a.id))} className={secondaryButton}>
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-muted">Aucune coupure en cours.</p>
          )}
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addAlertAction({ places, until, note }), () => (setPlaces(""), setUntil(""), setNote("")));
            }}
          >
            <Field label="Lieux" hint="Comme sur le planning, séparés par des virgules : Koungou village, Kawéni village, Labattoir – Centre.">
              <input value={places} onChange={(e) => setPlaces(e.target.value)} className={inputClass} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Jusqu'à (heure de Mayotte)">
                <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Raison (facultatif)">
                <input value={note} maxLength={160} onChange={(e) => setNote(e.target.value)} placeholder="Incident électrique" className={inputClass} />
              </Field>
            </div>
            <button type="submit" disabled={pending} className={secondaryButton}>
              Ajouter la coupure
            </button>
          </form>
        </div>
      </AdminCard>
    </>
  );
}

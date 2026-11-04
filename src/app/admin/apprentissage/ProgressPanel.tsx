"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { teachUnknownWordAction } from "@/app/(chat)/actions";
import { inputClass, primaryButton } from "@/components/admin/form";
import type { ActionResult } from "@/lib/admin/action-auth";
import type { ToLearn, WeekProgress } from "@/lib/language/progress";

export type ProgressTotals = { words: number; phrases: number; grammar: number; learnedThisWeek: number };

const weekFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-fg-muted">{label}</p>
    </div>
  );
}

/** Une phrase encore en français : le maître donne le shimaoré sur place. */
function TeachRow({ item }: { item: ToLearn }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await teachUnknownWordAction({ french: item.french, shimaore: value.trim() });
      setStatus(result);
      if (result.ok) router.refresh();
    });

  return (
    <li className="rounded-xl border border-border p-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 font-medium">« {item.french} »</p>
        <span className="shrink-0 text-xs text-fg-muted tabular-nums">{item.count} fois</span>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) save();
        }}
        className="mt-2 flex gap-2"
      >
        <input
          value={value}
          maxLength={200}
          disabled={pending}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus(null);
          }}
          placeholder="En shimaoré…"
          aria-label={`« ${item.french} » en shimaoré`}
          autoComplete="off"
          spellCheck={false}
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="submit" disabled={pending || !value.trim()} className={primaryButton}>
          {pending ? "…" : "Apprendre"}
        </button>
      </form>
      {status ? <p className={`mt-1.5 text-xs ${status.ok ? "text-success" : "text-danger"}`}>{status.message}</p> : null}
    </li>
  );
}

export function ProgressPanel({
  weeks,
  toLearn,
  totals,
  unavailable,
}: {
  weeks: WeekProgress[];
  toLearn: ToLearn[];
  totals: ProgressTotals;
  unavailable: boolean;
}) {
  const last = weeks.at(-1);
  const before = weeks.at(-2);
  const trend = last && before ? before.frenchShare - last.frenchShare : null;

  return (
    <div className="space-y-6 p-4 sm:p-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="mots appris" value={totals.words} />
        <Stat label="phrases modèles" value={totals.phrases} />
        <Stat label="règles de grammaire" value={totals.grammar} />
        <Stat label="appris ces 7 jours" value={totals.learnedThisWeek} />
      </div>

      <section>
        <h3 className="font-semibold">Part de ses réponses encore en français</h3>
        <p className="mt-0.5 text-sm text-fg-muted">
          Dans ses réponses au maître, semaine par semaine. Plus la barre est courte, mieux elle parle.
          {trend !== null && trend !== 0
            ? trend > 0
              ? ` ${trend} point${trend > 1 ? "s" : ""} de moins que la semaine d'avant 🎉`
              : ` ${-trend} point${trend < -1 ? "s" : ""} de plus que la semaine d'avant.`
            : ""}
        </p>
        {unavailable ? (
          <p className="mt-3 text-sm text-danger">Les conversations ne peuvent pas être lues (clé secrète manquante ?).</p>
        ) : weeks.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">Pas encore de conversation avec Tamilya en shimaoré.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {weeks.map((w) => (
              <li key={w.week} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-3 text-sm">
                <span className="text-fg-muted">{weekFormat.format(new Date(`${w.week}T00:00:00Z`))}</span>
                <span className="h-3 overflow-hidden rounded-full bg-bg-muted" title={`${w.frenchShare} % en français`}>
                  <span className="block h-full rounded-full bg-warning" style={{ width: `${Math.max(w.frenchShare, 1)}%` }} />
                </span>
                <span className="w-44 text-right tabular-nums">
                  <strong>{w.frenchShare} %</strong> en français
                  <span className="block text-xs text-fg-muted">
                    {w.fullyShimaore} % de réponses sans faute · {w.replies} rép.
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="font-semibold">À lui apprendre en priorité</h3>
        <p className="mt-0.5 text-sm text-fg-muted">
          Ce qu&apos;elle dit encore en français le plus souvent (30 derniers jours), sans compter ce que vous lui avez déjà
          appris. Donnez le shimaoré ici, c&apos;est retenu tout de suite.
        </p>
        {toLearn.length === 0 ? (
          <p className="mt-3 text-sm text-fg-muted">Rien en attente : tout ce qu&apos;elle a dit en français est déjà appris. 👏</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {toLearn.map((item) => (
              <TeachRow key={item.french} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionStatus, inputClass, primaryButton } from "@/components/admin/form";
import type { ActionResult } from "@/server/middlewares/admin-auth";
import { lostOk } from "@/lib/safe-action";
import { answerQuestionAction, ignoreQuestionAction } from "./actions";
import { GRAMMAR_LIMITS, type QuestionRow } from "./limits";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Indian/Mayotte" });

function QuestionItem({ row, onResult }: { row: QuestionRow; onResult: (result: ActionResult) => void }) {
  const router = useRouter();
  const [shimaore, setShimaore] = useState(row.phrase);
  const [french, setFrench] = useState(row.french);
  const [rule, setRule] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action().catch(lostOk);
      onResult(result);
      if (result.ok) router.refresh();
    });

  return (
    <li className="border-b border-border py-4 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 text-[15px] font-semibold">{row.question}</p>
        <span className="shrink-0 text-xs text-fg-muted">
          {row.source === "voix" ? "voix" : "chat"} · {row.occurrences > 1 ? `${row.occurrences} fois · ` : ""}
          {dateFormat.format(new Date(row.lastSeenAt))}
        </span>
      </div>
      <p className="mt-1 text-sm text-fg-muted">
        Elle a dit : <span className="text-accent">« {row.phrase} »</span>
      </p>
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) run(() => answerQuestionAction({ id: row.id, french, shimaore, rule }));
        }}
      >
        <input
          value={shimaore}
          maxLength={200}
          onChange={(e) => setShimaore(e.target.value)}
          aria-label="La bonne phrase en shimaoré"
          placeholder="La bonne phrase en shimaoré"
          autoComplete="off"
          className={`${inputClass} w-full`}
        />
        <input
          value={french}
          maxLength={200}
          onChange={(e) => setFrench(e.target.value)}
          aria-label="La phrase en français"
          placeholder="Ce que ça veut dire en français"
          autoComplete="off"
          className={`${inputClass} w-full`}
        />
        <textarea
          value={rule}
          maxLength={GRAMMAR_LIMITS.rule}
          onChange={(e) => setRule(e.target.value)}
          aria-label="Règle à retenir (facultatif)"
          placeholder="Règle à retenir (facultatif) : par exemple, où va le verbe"
          rows={2}
          className={`${inputClass} w-full`}
        />
        <div className="flex items-center justify-between gap-2">
          <button type="submit" disabled={pending || (!shimaore.trim() && !rule.trim())} className={`${primaryButton} px-4`}>
            C&apos;est juste / corrigé
          </button>
          <button
            type="button"
            onClick={() => run(() => ignoreQuestionAction(row.id))}
            disabled={pending}
            title="Question sans intérêt : retirer sans rien apprendre"
            className="rounded-lg px-2 py-2 text-sm text-fg-muted hover:bg-bg-muted hover:text-fg disabled:opacity-50"
          >
            Ignorer
          </button>
        </div>
      </form>
    </li>
  );
}

/**
 * Doutes de Tamilya sur son propre shimaoré, au chat comme à la voix (même cerveau).
 * La réponse du maître devient une phrase du lexique et/ou une règle de grammaire.
 */
export function QuestionsPanel({ rows, unavailable }: { rows: QuestionRow[]; unavailable: boolean }) {
  const [status, setStatus] = useState<ActionResult | null>(null);
  return (
    <section aria-labelledby="questions-title" className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="questions-title" className="font-semibold">
          Questions de Tamilya {rows.length > 0 ? <span className="text-accent">({rows.length})</span> : null}
        </h2>
        <span className="text-xs text-fg-muted">Ce dont elle n&apos;est pas sûre</span>
      </div>
      {unavailable ? (
        <p className="mt-3 text-sm text-fg-muted">
          Liste indisponible : appliquez la migration 20261219000000_questions_de_tamilya.sql dans Supabase.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">Aucune question pour l&apos;instant. Elle te demandera quand elle doutera.</p>
      ) : (
        <ul className="mt-2">
          {rows.map((row) => (
            <QuestionItem key={row.id} row={row} onResult={setStatus} />
          ))}
        </ul>
      )}
      <div className="mt-2">
        <ActionStatus result={status} />
      </div>
    </section>
  );
}

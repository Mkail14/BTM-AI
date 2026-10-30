"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inputClass, primaryButton } from "@/components/admin/form";
import type { ActionResult } from "@/lib/admin/action-auth";
import { ignoreRequestAction, translateRequestAction } from "./actions";
import { WORD_LIMITS, type WordRequestRow } from "./limits";

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "Indian/Mayotte" });

function RequestItem({ row, onResult }: { row: WordRequestRow; onResult: (result: ActionResult) => void }) {
  const router = useRouter();
  const [french, setFrench] = useState("");
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action();
      onResult(result);
      if (result.ok) router.refresh();
    });

  return (
    <li className="border-b border-border py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[15px] font-semibold text-accent" title={row.shimaore}>
          {row.shimaore}
        </p>
        <span className="shrink-0 text-xs text-fg-muted">
          {row.occurrences > 1 ? `${row.occurrences} fois · ` : ""}
          {dateFormat.format(new Date(row.lastSeenAt))}
        </span>
      </div>
      {row.example ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-fg-muted" title={row.example}>
          « {row.example} »
        </p>
      ) : null}
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (french.trim() && !pending) run(() => translateRequestAction({ id: row.id, french }));
        }}
      >
        <input
          value={french}
          maxLength={WORD_LIMITS.word}
          onChange={(e) => setFrench(e.target.value)}
          placeholder="En français…"
          aria-label={`Traduction en français de « ${row.shimaore} »`}
          autoComplete="off"
          className={`${inputClass} min-w-0 flex-1`}
        />
        <button type="submit" disabled={pending || !french.trim()} className={`${primaryButton} shrink-0 px-3`}>
          Ajouter
        </button>
        <button
          type="button"
          onClick={() => run(() => ignoreRequestAction(row.id))}
          disabled={pending}
          title="Faute de frappe, mot français… : retirer sans rien apprendre"
          className="shrink-0 rounded-lg px-2 text-sm text-fg-muted hover:bg-bg-muted hover:text-fg disabled:opacity-50"
        >
          Ignorer
        </button>
      </form>
    </li>
  );
}

/**
 * Mots shimaoré employés par des utilisateurs et qu'Awa n'a pas compris.
 * Une traduction ajoutée ici entre dans le dictionnaire : Awa le sait au message suivant.
 */
export function WordRequests({ rows, unavailable }: { rows: WordRequestRow[]; unavailable: boolean }) {
  const [status, setStatus] = useState<ActionResult | null>(null);
  if (!unavailable && rows.length === 0 && !status) return null;

  return (
    <section aria-labelledby="requests-title" className="rounded-xl border border-accent/40 bg-bg p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="requests-title" className="font-semibold">
          À traduire {rows.length > 0 ? <span className="text-accent">({rows.length})</span> : null}
        </h2>
        <span className="text-xs text-fg-muted">Mots qu&apos;Awa n&apos;a pas compris</span>
      </div>
      {unavailable ? (
        <p className="mt-3 text-sm text-fg-muted">
          Liste indisponible : appliquez la migration 20261106000000_awa_word_requests.sql dans Supabase.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">Plus rien à traduire.</p>
      ) : (
        <ul className="mt-2">
          {rows.map((row) => (
            <RequestItem key={row.id} row={row} onResult={setStatus} />
          ))}
        </ul>
      )}
      {status ? (
        <p role="status" className={`mt-2 text-sm ${status.ok ? "text-success" : "text-danger"}`}>
          {status.ok ? "✓ " : ""}
          {status.message}
        </p>
      ) : null}
    </section>
  );
}

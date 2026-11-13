"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { secondaryButton } from "@/components/admin/form";
import type { ActionResult } from "@/lib/admin/action-auth";
import { lostOk } from "@/lib/safe-action";
import { keepBothAction, setTranslationAction } from "./actions";
import type { ConflictRow } from "./limits";

function ConflictItem({ row, onResult }: { row: ConflictRow; onResult: (result: ActionResult) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const result = await action().catch(lostOk);
      onResult(result);
      if (result.ok) router.refresh();
    });

  return (
    <li className="border-b border-border py-3 last:border-b-0">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[15px] font-semibold" title={row.french}>
          {row.french}
        </p>
        {row.asked ? (
          <span className="shrink-0 text-xs text-accent">Tamilya l&apos;a demandé{row.asked > 1 ? ` ${row.asked} fois` : ""}</span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {row.translations.map((translation) => (
          <button
            key={translation}
            type="button"
            onClick={() => run(() => setTranslationAction({ french: row.french, shimaore: translation, category: row.category }))}
            disabled={pending}
            title={`Garder « ${translation} » et retirer les autres`}
            className={`${secondaryButton} px-3 font-medium text-accent`}
          >
            Garder « {translation} »
          </button>
        ))}
        <button
          type="button"
          onClick={() => run(() => keepBothAction({ french: row.french, translations: row.translations }))}
          disabled={pending}
          title="Toutes ces traductions se disent : les garder et ne plus les signaler"
          className="shrink-0 rounded-lg px-2 text-sm text-fg-muted hover:bg-bg-muted hover:text-fg disabled:opacity-50"
        >
          Toutes se disent
        </button>
      </div>
    </li>
  );
}

/**
 * Mots français qui ont plusieurs traductions dans le dictionnaire : Tamilya
 * ne sait pas laquelle prendre. L'administrateur garde la bonne ici.
 */
export function ConflictsPanel({ rows }: { rows: ConflictRow[] }) {
  const [status, setStatus] = useState<ActionResult | null>(null);
  return (
    <section aria-labelledby="conflicts-title" className="p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="conflicts-title" className="font-semibold">
          Conflits {rows.length > 0 ? <span className="text-accent">({rows.length})</span> : null}
        </h2>
        <span className="text-xs text-fg-muted">Un mot, plusieurs traductions</span>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">Aucun conflit : chaque mot n&apos;a qu&apos;une traduction.</p>
      ) : (
        <ul className="mt-2">
          {rows.map((row) => (
            <ConflictItem key={row.french} row={row} onResult={setStatus} />
          ))}
        </ul>
      )}
      {status ? (
        <p role="status" className={`mt-2 text-sm ${status.ok ? "text-success" : "text-danger"}`}>
          {status.ok ? <Check aria-hidden="true" className="mr-1 inline size-4 align-[-3px]" /> : null}
          {status.message}
        </p>
      ) : null}
    </section>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionStatus, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import type { ActionResult } from "@/lib/admin/action-auth";
import { CORRECTION_MAX_CHARS } from "@/lib/voice-live/listening";
import type { VoiceCorrectionRow } from "@/lib/voice-live/corrections";
import { lostOk } from "@/lib/safe-action";
import { addCorrectionAction, removeCorrectionAction } from "./actions";

/** Ce que Tamilya entend de travers et ce qui a vraiment été dit. */
export function ListeningCorrections({ corrections }: { corrections: VoiceCorrectionRow[] | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [heard, setHeard] = useState("");
  const [meant, setMeant] = useState("");

  const run = (action: () => Promise<ActionResult>, after?: () => void) =>
    start(async () => {
      const res = await action().catch(lostOk);
      setResult(res);
      if (res.ok) after?.();
      router.refresh();
    });

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-bg p-5">
      <div>
        <h2 className="font-semibold">Mots mal entendus</h2>
        <p className="mt-1 text-sm text-fg-muted">
          Quand Tamilya déforme un mot, note ce qui s&apos;est affiché et ce que tu as vraiment dit. Elle s&apos;en sert pour écouter, et le texte enregistré est corrigé.
        </p>
      </div>

      {corrections === null ? (
        <p className="text-sm text-fg-muted">Liste indisponible : appliquer la migration 20261204000000_corrections_ecoute.sql.</p>
      ) : (
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addCorrectionAction({ heard, meant }),
              () => {
                setHeard("");
                setMeant("");
              },
            );
          }}
        >
          <input aria-label="Ce qui s'est affiché" value={heard} onChange={(e) => setHeard(e.target.value)} maxLength={CORRECTION_MAX_CHARS} placeholder="Ce qui s'est affiché" className={inputClass} />
          <input aria-label="Ce que tu as dit" value={meant} onChange={(e) => setMeant(e.target.value)} maxLength={CORRECTION_MAX_CHARS} placeholder="Ce que tu as dit" className={inputClass} />
          <button type="submit" disabled={pending || heard.trim().length < 2 || !meant.trim()} className={primaryButton}>
            Ajouter
          </button>
        </form>
      )}

      {corrections?.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {corrections.map((row) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                <span className="text-fg-muted">{row.heard}</span> <span aria-hidden="true">→</span> <span className="font-medium">{row.meant}</span>
              </span>
              <button type="button" disabled={pending} onClick={() => run(() => removeCorrectionAction({ id: row.id }))} className={`${secondaryButton} shrink-0`}>
                Retirer
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {result ? <ActionStatus result={result} /> : null}
    </section>
  );
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { dismissResetAction, resetAccountAction } from "@/app/admin/demandes/actions";
import { ActionStatus } from "@/components/admin/form";
import { PendingBadge } from "@/components/admin/PendingBadge";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { lostOk } from "@/lib/safe-action";
import type { ActionResult } from "@/server/middlewares/admin-auth";

export type ResetRequest = { id: string; email: string | null; at: string };

const atFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

/**
 * Demandes en attente du tableau de bord : « code oublié » des délégués
 * (principal seulement, avec Réinitialiser ou Refuser) et mots à traduire.
 */
export function AdminRequests({ resets, wordsToTranslate }: { resets: ResetRequest[]; wordsToTranslate: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const total = resets.length + wordsToTranslate;
  if (total === 0 && !result) return null;

  const run = (action: () => Promise<ActionResult>) =>
    start(async () => {
      setResult(await action().catch(lostOk));
      router.refresh();
    });

  const reset = (r: ResetRequest) =>
    void confirmDialog({
      title: `Réinitialiser ${r.email ?? "ce compte"} ?`,
      message:
        "Le compte sera supprimé en entier (conversations comprises). La personne le recréera avec la même adresse, puis tu lui redonneras l'accès admin dans Mon compte, Administration.",
      confirmLabel: "Supprimer le compte",
      tone: "danger",
    }).then((ok) => ok && run(() => resetAccountAction({ userId: r.id })));

  return (
    <section aria-labelledby="demandes" className="shrink-0 rounded-2xl border border-border bg-bg p-4">
      <h2 id="demandes" className="flex items-center gap-2 text-sm font-semibold">
        Demandes en attente <PendingBadge count={total} />
      </h2>
      <ul className="mt-2 divide-y divide-border text-sm">
        {resets.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{r.email ?? "Sans e-mail"}</span>
              <span className="text-xs text-fg-muted">Code oublié · {atFormat.format(new Date(r.at))}</span>
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => dismissResetAction({ userId: r.id }))}
              className="rounded-md px-2 py-1 text-xs font-medium text-fg-muted hover:bg-bg-muted hover:text-fg disabled:opacity-50"
            >
              Refuser
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => reset(r)}
              className="rounded-md px-2 py-1 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
            >
              Réinitialiser
            </button>
          </li>
        ))}
        {wordsToTranslate > 0 ? (
          <li className="flex items-center gap-2 py-2">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {wordsToTranslate} mot{wordsToTranslate > 1 ? "s" : ""} shimaoré à traduire
              </span>
              <span className="text-xs text-fg-muted">Tamilya les saura au message suivant</span>
            </span>
            <Link href="/admin/lexique" className="rounded-md px-2 py-1 text-xs font-medium text-accent hover:bg-accent-soft">
              Traduire
            </Link>
          </li>
        ) : null}
      </ul>
      {result ? (
        <div className="mt-2">
          <ActionStatus result={result} />
        </div>
      ) : null}
    </section>
  );
}

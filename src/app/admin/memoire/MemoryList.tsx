"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionStatus } from "@/components/admin/form";
import { IconTrash } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import { deleteMemoryAction } from "./actions";

export type MemoryAccount = {
  userId: string;
  email: string | null;
  facts: { id: string; kind: string; content: string; updatedAt: string }[];
};

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeZone: "Indian/Mayotte" });

export function MemoryList({ accounts, total }: { accounts: MemoryAccount[]; total: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(input: { memoryId: string } | { userId: string }, question: string) {
    if (!window.confirm(question)) return;
    startTransition(async () => {
      const result = await deleteMemoryAction(input);
      setStatus(result);
      if (result.ok) router.refresh();
    });
  }

  if (accounts.length === 0) {
    return (
      <p className="max-w-4xl rounded-xl border border-dashed border-border bg-bg p-6 text-center text-sm text-fg-muted">
        Aucun souvenir enregistré pour l&apos;instant.
      </p>
    );
  }

  return (
    <div className="max-w-4xl space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm text-fg-muted">
        <span>
          {total} souvenir{total > 1 ? "s" : ""} au total · {accounts.length} compte{accounts.length > 1 ? "s" : ""} affiché
          {accounts.length > 1 ? "s" : ""} (les plus récents)
        </span>
        <ActionStatus result={status} />
      </div>
      <ul className="space-y-2">
        {accounts.map((account) => (
          <li key={account.userId} className="rounded-xl border border-border bg-bg p-4">
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1 truncate font-medium">{account.email ?? "Compte supprimé"}</span>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  remove({ userId: account.userId }, `Effacer toute la mémoire de ${account.email ?? "ce compte"} ?`)
                }
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
              >
                Tout effacer
              </button>
            </div>
            <ul className="mt-2 divide-y divide-border text-sm">
              {account.facts.map((fact) => (
                <li key={fact.id} className="flex items-center gap-3 py-1.5">
                  <span className="min-w-0 flex-1 break-words">{fact.content}</span>
                  <span className="shrink-0 text-xs text-fg-muted">{dateFormat.format(new Date(fact.updatedAt))}</span>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => remove({ memoryId: fact.id }, `Supprimer « ${fact.content} » ?`)}
                    aria-label={`Supprimer : ${fact.content}`}
                    className="shrink-0 rounded-lg p-1.5 text-fg-muted hover:bg-bg-muted hover:text-danger disabled:opacity-50"
                  >
                    <IconTrash width={15} height={15} />
                  </button>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

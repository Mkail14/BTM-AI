"use client";

import { useState, useTransition } from "react";
import { lostOk } from "@/lib/safe-action";
import { deleteListingAction, detachOwnerAction } from "../actions";

/** Retirer la main à l'entreprise, ou supprimer la fiche (avec confirmation). */
export function ListingDangerZone({ id, owned }: { id: string; owned: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startAction] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; message: string }>) => startAction(async () => setMessage(await action().catch(lostOk)));

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg p-4 sm:p-5">
      {owned ? (
        <button type="button" disabled={pending} onClick={() => run(() => detachOwnerAction(id))} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-bg-muted">
          Retirer la main à l&apos;entreprise
        </button>
      ) : null}
      {confirming ? (
        <>
          <span className="text-sm">Supprimer la fiche et ses chiffres ?</span>
          <button type="button" disabled={pending} onClick={() => run(() => deleteListingAction(id))} className="rounded-lg bg-danger px-3 py-2 text-sm font-medium text-white">
            Oui, supprimer
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-bg-muted">
            Annuler
          </button>
        </>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className="rounded-lg border border-border px-3 py-2 text-sm text-danger hover:bg-bg-muted">
          Supprimer la fiche
        </button>
      )}
      {message ? (
        <p role="status" className={`w-full text-sm ${message.ok ? "text-fg-muted" : "text-danger"}`}>
          {message.message}
        </p>
      ) : null}
    </section>
  );
}

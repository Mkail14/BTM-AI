"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/admin/action-auth";
import { setCodeExamStatusAction } from "./actions";

/** Boutons d'une demande : réservée à la main sur le site de La Poste, annulée, ou remise à traiter. */
export function RequestActions({ id, status }: { id: string; status: "pending" | "booked" | "cancelled" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const run = (next: "pending" | "booked" | "cancelled") =>
    start(async () => {
      const res = await setCodeExamStatusAction({ id, status: next });
      setResult(res);
      if (res.ok) router.refresh();
    });

  const button = "rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "pending" ? (
        <>
          <button type="button" disabled={pending} onClick={() => run("booked")} className={`${button} bg-fg text-bg hover:opacity-90`}>
            Marquer réservée
          </button>
          <button type="button" disabled={pending} onClick={() => run("cancelled")} className={`${button} border border-border hover:bg-danger-soft hover:text-danger`}>
            Annuler
          </button>
        </>
      ) : (
        <button type="button" disabled={pending} onClick={() => run("pending")} className={`${button} border border-border hover:bg-bg-muted`}>
          Remettre à traiter
        </button>
      )}
      {result && !result.ok ? <span className="text-xs text-danger">{result.message}</span> : null}
    </div>
  );
}

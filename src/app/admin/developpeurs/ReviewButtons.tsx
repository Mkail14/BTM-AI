"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionStatus, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import type { ActionResult } from "@/lib/admin/action-auth";
import type { DeveloperStatus } from "@/lib/developers/accounts";
import { lostOk } from "@/lib/safe-action";
import { reviewDeveloperAction } from "./actions";

/** Suspendre (avec un motif, montré au développeur) ou rétablir l'accès. */
export function ReviewButtons({ userId, status }: { userId: string; status: DeveloperStatus }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const suspend = status === "approved";

  const decide = () =>
    startTransition(async () => {
      const response = await reviewDeveloperAction({ userId, decision: suspend ? "suspended" : "approved", note }).catch(lostOk);
      setResult(response);
      if (response.ok) {
        setNote("");
        router.refresh();
      }
    });

  return (
    <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4">
      {suspend ? (
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          placeholder="Motif (montré au développeur)"
          aria-label="Motif"
          className={inputClass}
        />
      ) : null}
      <button type="button" disabled={pending} onClick={decide} className={`self-start ${suspend ? `${secondaryButton} text-danger` : primaryButton}`}>
        {suspend ? "Suspendre" : "Rétablir l'accès"}
      </button>
      <ActionStatus result={result} />
    </div>
  );
}

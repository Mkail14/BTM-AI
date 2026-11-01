"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconClose } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import type { RateLimitSettings, RateLimitSubjectName } from "@/lib/rate-limit/settings";
import { saveRateLimitsAction } from "./actions";

const ROWS: { id: RateLimitSubjectName; label: string; hint: string }[] = [
  { id: "anonymousDevice", label: "Visiteur sans compte", hint: "Par appareil" },
  { id: "anonymousIp", label: "Même adresse IP", hint: "Tous appareils confondus" },
  { id: "user", label: "Utilisateur connecté", hint: "Par compte" },
];

/** Fenêtre de réglage du bloc « Quotas et sécurité » : messages par minute et par jour. */
export function GuardDialog({ limits, onClose }: { limits: RateLimitSettings; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState(limits);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("input")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function change(id: RateLimitSubjectName, field: "minute" | "day", raw: string) {
    setValues((v) => ({ ...v, [id]: { ...v[id], [field]: Number.parseInt(raw, 10) || 0 } }));
    setStatus(null);
  }

  function submit() {
    startTransition(async () => {
      const result = await saveRateLimitsAction(values);
      setStatus(result);
      if (result.ok) {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guard-title"
        className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-2xl border border-border bg-bg p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="guard-title" className="text-lg font-semibold">
              Quotas et sécurité
            </h2>
            <p className="mt-0.5 text-sm text-fg-muted">Nombre de messages autorisés avant « trop de requêtes ».</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-2 text-fg-muted hover:bg-bg-muted">
            <IconClose />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="mt-4"
        >
          <div className="grid grid-cols-[1fr_6rem_6rem] items-center gap-x-3 gap-y-2.5 text-sm">
            <span />
            <span className="text-xs font-medium text-fg-muted">Par minute</span>
            <span className="text-xs font-medium text-fg-muted">Par jour</span>
            {ROWS.map((row) => (
              <div key={row.id} className="contents">
                <div className="min-w-0">
                  <p className="font-medium">{row.label}</p>
                  <p className="text-xs text-fg-muted">{row.hint}</p>
                </div>
                {(["minute", "day"] as const).map((field) => (
                  <input
                    key={field}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    required
                    aria-label={`${row.label}, ${field === "minute" ? "par minute" : "par jour"}`}
                    value={values[row.id][field] || ""}
                    onChange={(e) => change(row.id, field, e.target.value)}
                    className={`${inputClass} tabular-nums`}
                  />
                ))}
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-fg-muted">
            Beaucoup d&apos;abonnés mobiles à Mayotte partagent la même IP : gardez la limite par IP large.
          </p>

          {status && !status.ok ? (
            <p role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm">
              {status.message}
            </p>
          ) : null}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
              Annuler
            </button>
            <button type="submit" disabled={pending} className={primaryButton}>
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

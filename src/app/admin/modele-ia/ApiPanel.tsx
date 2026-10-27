"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { IconChip, IconClose, IconRetry } from "@/components/ui/icons";
import { testSlotAction, type SlotTestResult } from "./actions";
import { STATUS_STYLES, type FlowNode } from "./flow";

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium tracking-wide text-fg-muted uppercase">{title}</h3>
        {aside}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/** Jauge « restant avant épuisement » : pleine = tout reste, vide = épuisé. */
function Gauge({ remainingRatio, label }: { remainingRatio: number; label: string }) {
  const color = remainingRatio <= 0.1 ? "bg-danger" : remainingRatio <= 0.3 ? "bg-warning" : "bg-success";
  return (
    <div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(remainingRatio * 100)}
        className="h-2.5 overflow-hidden rounded-full bg-bg-muted"
      >
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(remainingRatio * 100, 0)}%` }} />
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: { label: string; value: string; masked?: boolean }[] }) {
  return (
    <dl className="text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-b-0">
          <dt className="shrink-0 text-fg-muted">{row.label}</dt>
          <dd
            className={
              row.masked
                ? "min-w-0 rounded bg-bg-muted px-1.5 py-0.5 text-right font-mono text-xs break-all text-fg-muted select-none"
                : "min-w-0 text-right font-medium break-words"
            }
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Fiche d'une API : connexion (valeurs grisées), quota restant, activité, essai. */
export function ApiPanel({ node, onClose }: { node: FlowNode; onClose: () => void }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<SlotTestResult | null>(null);
  const [testing, startTesting] = useTransition();
  const api = node.api!;
  const style = STATUS_STYLES[node.status];

  useEffect(() => {
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function test() {
    startTesting(async () => {
      setResult(await testSlotAction(node.apiId));
      router.refresh();
    });
  }

  const { credit, freeQuota } = api;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`API ${node.title}`}
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-border bg-bg p-5 shadow-xl outline-none"
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <IconChip width={20} height={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{node.title}</h2>
            <p className="truncate text-xs text-fg-muted">{node.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-2 text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <IconClose />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.pill}`}>
            <span aria-hidden="true" className={`size-2 rounded-full ${style.dot}`} />
            {node.statusLabel}
          </span>
          {node.inService ? (
            <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-fg">En service</span>
          ) : null}
        </div>
        {node.reason ? <p className="mt-2 text-sm break-words text-fg-muted">{node.reason}</p> : null}

        <Section title="Quota restant avant épuisement">
          {freeQuota || credit ? (
            <div className="space-y-4">
              {freeQuota ? (
                <div>
                  <p className="flex items-baseline justify-between gap-2 text-sm">
                    <span>Requêtes gratuites du jour</span>
                    <span className="font-semibold tabular-nums">
                      {freeQuota.remaining} / {freeQuota.limit}
                    </span>
                  </p>
                  <div className="mt-1.5">
                    <Gauge remainingRatio={freeQuota.remaining / freeQuota.limit} label="Requêtes gratuites restantes" />
                  </div>
                  <p className="mt-1.5 text-xs text-fg-muted">Remise à zéro dans {freeQuota.resetIn}.</p>
                </div>
              ) : null}
              {credit ? (
                <div>
                  <p className="flex items-baseline justify-between gap-2 text-sm">
                    <span>Crédit de la clé</span>
                    <span className="font-semibold tabular-nums">
                      {credit.remaining !== null && credit.limit !== null
                        ? `${credit.remaining} / ${credit.limit}`
                        : "Sans plafond"}
                    </span>
                  </p>
                  {credit.ratio !== null ? (
                    <div className="mt-1.5">
                      <Gauge remainingRatio={1 - credit.ratio} label="Crédit restant" />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-fg-muted">Quota non communiqué par ce fournisseur.</p>
          )}
        </Section>

        <Section title="Connexion">
          <Rows rows={api.connection} />
        </Section>

        <Section title="Activité">
          <Rows rows={api.activity} />
        </Section>

        {node.status !== "off" ? (
          <Section title="Essai">
            <button
              type="button"
              onClick={test}
              disabled={testing}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
            >
              <IconRetry width={16} height={16} className={testing ? "animate-spin" : ""} />
              {testing ? "Test en cours…" : "Tester cette API"}
            </button>
            {result ? (
              <p
                role="status"
                className={`mt-2 rounded-lg px-3 py-2 text-sm break-words ${result.ok ? "bg-success-soft" : "bg-danger-soft"}`}
              >
                <span className="font-medium">{result.ok ? "✓ Répond" : "✕ Échec"}</span>
                {result.latencyMs !== null ? ` en ${(result.latencyMs / 1000).toFixed(1)} s` : ""} — {result.message}
              </p>
            ) : null}
          </Section>
        ) : null}
      </div>
    </>
  );
}

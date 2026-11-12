"use client";

import { useState, useTransition } from "react";
import { ActionStatus } from "@/components/admin/form";
import type { ActionResult } from "@/lib/admin/action-auth";
import { FEATURES, type FeatureId, type FeatureSwitches as Switches } from "@/lib/site/features-rules";
import { lostOk } from "@/lib/safe-action";
import { setFeatureAction } from "./actions";

/** Chaque interrupteur s'enregistre dès qu'on le touche ; il revient en arrière si l'enregistrement échoue. */
export function FeatureSwitches({ saved }: { saved: Switches }) {
  const [switches, setSwitches] = useState(saved);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState<FeatureId | null>(null);
  const [, startSaving] = useTransition();

  function toggle(feature: FeatureId, enabled: boolean) {
    setSwitches((s) => ({ ...s, [feature]: enabled }));
    setStatus(null);
    setPending(feature);
    startSaving(async () => {
      const result = await setFeatureAction({ feature, enabled }).catch(lostOk);
      if (!result.ok) setSwitches((s) => ({ ...s, [feature]: !enabled }));
      setStatus(result);
      setPending(null);
    });
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-bg shadow-sm">
      <div className="px-5 pt-5 pb-4">
        <h1 className="text-lg font-semibold tracking-tight">Fonctionnalités</h1>
        <p className="text-sm text-fg-muted">Allumée : tout le monde l&apos;a. Éteinte : seulement les administrateurs, qui gardent tout.</p>
      </div>
      <ul className="divide-y divide-border border-t border-border">
        {FEATURES.map((feature) => {
          const on = switches[feature.id];
          return (
            <li key={feature.id}>
              <label className="flex cursor-pointer items-center gap-4 px-5 py-4">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{feature.label}</span>
                  <span className="block text-sm text-fg-muted">{feature.description}</span>
                </span>
                <span className={`shrink-0 text-sm font-medium ${on ? "text-success" : "text-fg-muted"}`}>{on ? "Pour tous" : "Admin"}</span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label={`${feature.label} pour tout le monde`}
                  checked={on}
                  disabled={pending === feature.id}
                  onChange={(e) => toggle(feature.id, e.target.checked)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className="relative h-6 w-10 shrink-0 rounded-full bg-border transition peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-disabled:opacity-60 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
                />
              </label>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border px-5 py-3 empty:hidden">
        <ActionStatus result={status} />
      </div>
    </section>
  );
}

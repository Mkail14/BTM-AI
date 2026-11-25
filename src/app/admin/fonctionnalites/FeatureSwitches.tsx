"use client";

import Link from "next/link";
import { useState, useTransition, type ComponentType, type SVGProps } from "react";
import { ActionStatus } from "@/components/admin/form";
import { IconDocument, IconMapPin, IconMic, IconSettings, IconStar, IconUsers, IconWallet } from "@/components/ui/icons";
import type { ActionResult } from "@/server/middlewares/admin-auth";
import { FEATURE_GROUPS, FEATURE_IDS, FEATURE_INFO, type FeatureId, type FeatureSwitches as Switches } from "@/lib/site/features-rules";
import { lostOk } from "@/lib/safe-action";
import { setFeatureAction } from "./actions";
import { RestrictedAlert } from "./RestrictedAlert";

const GROUP_ICONS: Record<string, ComponentType<SVGProps<SVGSVGElement>>> = {
  pratique: IconMapPin,
  emploi: IconUsers,
  documents: IconDocument,
  achats: IconWallet,
  loisirs: IconStar,
  voix: IconMic,
};

/** Chaque interrupteur s'enregistre dès qu'on le touche ; il revient en arrière si l'enregistrement échoue. */
export function FeatureSwitches({ saved }: { saved: Switches }) {
  const [switches, setSwitches] = useState(saved);
  const [status, setStatus] = useState<{ feature: FeatureId; result: ActionResult } | null>(null);
  const [pending, setPending] = useState<FeatureId | null>(null);
  const [, startSaving] = useTransition();
  /** Fonctionnalité sans accord qu'on vient d'allumer : l'alerte attend la réponse, l'interrupteur ne bouge pas. */
  const [asking, setAsking] = useState<FeatureId | null>(null);

  function toggle(feature: FeatureId, enabled: boolean, confirmed = false) {
    if (enabled && FEATURE_INFO[feature].restricted && !confirmed) {
      setAsking(feature);
      return;
    }
    setSwitches((s) => ({ ...s, [feature]: enabled }));
    setStatus(null);
    setPending(feature);
    startSaving(async () => {
      const result = await setFeatureAction({ feature, enabled, confirmed }).catch(lostOk);
      if (!result.ok) setSwitches((s) => ({ ...s, [feature]: !enabled }));
      setStatus({ feature, result });
      setPending(null);
    });
  }

  const onCount = FEATURE_IDS.filter((id) => switches[id]).length;

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Fonctionnalités</h1>
          <p className="mt-1 text-sm text-fg-muted">Allumée : tout le monde l&apos;a. Éteinte : seulement les administrateurs, qui gardent tout.</p>
        </div>
        <dl className="flex shrink-0 gap-2 text-sm">
          <div className="flex items-center gap-2 rounded-full bg-success-soft px-3 py-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-success" />
            <dt className="sr-only">Pour tous</dt>
            <dd>
              <span className="font-semibold">{onCount}</span> pour tous
            </dd>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-bg-muted px-3 py-1.5">
            <span aria-hidden="true" className="size-2 rounded-full bg-fg-muted" />
            <dt className="sr-only">Réservées aux admins</dt>
            <dd>
              <span className="font-semibold">{FEATURE_IDS.length - onCount}</span> admins seulement
            </dd>
          </div>
        </dl>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {FEATURE_GROUPS.map((group) => {
          const Icon = GROUP_ICONS[group.id] ?? IconSettings;
          const groupOn = group.features.filter((id) => switches[id]).length;
          return (
            <section key={group.id} aria-labelledby={`theme-${group.id}`} className="overflow-hidden rounded-2xl border border-border bg-bg shadow-sm">
              <div className="flex items-center gap-3 border-b border-border bg-bg-subtle/60 px-4 py-3">
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                  <Icon width={17} height={17} />
                </span>
                <h2 id={`theme-${group.id}`} className="flex-1 font-semibold">
                  {group.label}
                </h2>
                <span className="text-xs text-fg-muted">
                  {groupOn} sur {group.features.length} pour tous
                </span>
              </div>
              <ul className="divide-y divide-border">
                {group.features.map((id) => {
                  const feature = FEATURE_INFO[id];
                  const on = switches[id];
                  return (
                    <li key={id} className="px-4 py-3.5">
                      <div className="flex items-start gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <label htmlFor={`fonction-${id}`} className="cursor-pointer font-medium">
                              {feature.label}
                            </label>
                            {feature.restricted ? (
                              <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-danger">Pas encore le droit</span>
                            ) : null}
                            {feature.costly ? (
                              <span className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-medium">Coûte des appels</span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-sm text-fg-muted">{feature.summary}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5 pt-0.5">
                          <span className={`text-xs font-medium ${on ? "text-success" : "text-fg-muted"}`}>{on ? "Pour tous" : "Admin"}</span>
                          <span className="relative inline-flex">
                            <input
                              id={`fonction-${id}`}
                              type="checkbox"
                              role="switch"
                              aria-label={`${feature.label} pour tout le monde`}
                              checked={on}
                              disabled={pending === id}
                              onChange={(e) => toggle(id, e.target.checked)}
                              className="peer absolute inset-0 z-10 cursor-pointer opacity-0 disabled:cursor-wait"
                            />
                            <span
                              aria-hidden="true"
                              className="relative h-6 w-10 rounded-full bg-border transition peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-disabled:opacity-60 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
                            />
                          </span>
                        </div>
                      </div>

                      {feature.settings || feature.details ? (
                        <div className="mt-2 flex flex-wrap items-start gap-x-4 gap-y-1">
                          {feature.settings ? (
                            <Link
                              href={feature.settings}
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-2 hover:underline"
                            >
                              <IconSettings width={14} height={14} /> Réglages
                            </Link>
                          ) : null}
                          {feature.details ? (
                            <details className="group min-w-0 flex-1 text-sm">
                              <summary className="cursor-pointer list-none text-fg-muted select-none hover:text-fg [&::-webkit-details-marker]:hidden">
                                <span className="group-open:hidden">Plus de détails</span>
                                <span className="hidden group-open:inline">Moins de détails</span>
                              </summary>
                              <p className="mt-1.5 rounded-lg bg-bg-subtle px-3 py-2 text-fg-muted">{feature.details}</p>
                            </details>
                          ) : null}
                        </div>
                      ) : null}

                      {status?.feature === id ? (
                        <div className="mt-2">
                          <ActionStatus result={status.result} />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {asking ? (
        <RestrictedAlert
          feature={FEATURE_INFO[asking]}
          onQuit={() => setAsking(null)}
          onConfirm={() => {
            setAsking(null);
            toggle(asking, true, true);
          }}
        />
      ) : null}
    </>
  );
}

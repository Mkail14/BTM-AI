"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { lostOk } from "@/lib/safe-action";
import type { AccountWidget } from "@/server/services/entreprises/widgets";
import { linkWidgetAction } from "./actions";

/** Les widgets Tamilya du compte : chacun peut répondre avec la fiche de l'entreprise. */
export function WidgetLinks({ widgets, listingId }: { widgets: AccountWidget[] | null; listingId: string }) {
  const [linked, setLinked] = useState(() => Object.fromEntries((widgets ?? []).map((w) => [w.id, w.listingId === listingId])));
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  if (!widgets) return <p className="text-sm text-fg-muted">Le chatbot n&apos;est pas disponible pour le moment.</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed text-fg-muted">
        Mettez Tamilya sur votre site : une bulle de discussion, gratuite. Reliée à votre fiche, elle répond à vos clients avec vos horaires, vos services et votre numéro. Sa mission (accueil, prise de commande…) se règle dans l&apos;espace développeurs.
      </p>
      {widgets.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
          {widgets.map((w) => (
            <li key={w.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{w.label}</p>
                <p className="truncate text-xs text-fg-muted">{w.origins.join(", ")}</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={pending}
                  checked={linked[w.id] ?? false}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setLinked((l) => ({ ...l, [w.id]: on }));
                    start(async () => {
                      const outcome = await linkWidgetAction({ widgetId: w.id, listingId: on ? listingId : null }).catch(lostOk);
                      if (!outcome.ok) setLinked((l) => ({ ...l, [w.id]: !on }));
                      setResult(outcome);
                    });
                  }}
                  className="size-4 accent-[var(--accent)]"
                />
                Répond avec ma fiche
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm">Vous n&apos;avez pas encore de chatbot.</p>
      )}
      <Link href="/developpeurs#widget" className="inline-flex h-11 items-center self-start rounded-full border border-border px-6 text-[15px] font-medium hover:bg-bg-muted">
        {widgets.length ? "Régler mes chatbots" : "Créer mon chatbot"}
      </Link>
      {result ? (
        <p role="status" className={`text-sm ${result.ok ? "text-success" : "text-danger"}`}>
          {result.message}
        </p>
      ) : null}
    </div>
  );
}

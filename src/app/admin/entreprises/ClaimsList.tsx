"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { lostOk } from "@/lib/safe-action";
import type { PendingClaim } from "@/server/services/entreprises/claims";
import { claimCodeSentAction, refuseClaimAction } from "./actions";

const dayFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "Indian/Mayotte" });

/**
 * Entreprises qui veulent prendre la main sur leur fiche. Leur SIRET correspond déjà :
 * il reste à leur transmettre le code au numéro de la fiche (appel ou SMS), jamais à un autre.
 */
export function ClaimsList({ claims }: { claims: PendingClaim[] }) {
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startAction] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; message: string }>) => startAction(async () => setMessage(await action().catch(lostOk)));

  return (
    <section className="rounded-xl border border-accent/40 bg-bg p-4 sm:p-5">
      <h2 className="font-semibold">Demandes de rattachement · {claims.length}</h2>
      <p className="mt-1 text-sm text-fg-muted">
        Le SIRET est bon. Appelez ou envoyez un SMS à un numéro de la fiche (jamais un autre) et donnez le code : l&apos;entreprise le tape dans son espace.
      </p>
      <ul className="mt-4 divide-y divide-border">
        {claims.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-x-5 gap-y-2 py-3">
            <div className="min-w-0 flex-1">
              <Link href={`/admin/entreprises/${c.listingId}`} className="font-medium underline-offset-4 hover:underline">
                {c.listingName}
              </Link>
              <p className="text-xs text-fg-muted">
                Demandé par {c.contactName}, le {dayFormat.format(new Date(c.createdAt))} · Numéro{c.phones.length > 1 ? "s" : ""} de la fiche :{" "}
                {c.phones.map((p) => (
                  <a key={p} href={`tel:${p}`} className="mr-2 font-medium text-fg underline underline-offset-2">
                    {p}
                  </a>
                ))}
              </p>
            </div>
            <span className="rounded-lg bg-bg-muted px-3 py-1 font-mono text-lg tracking-[0.3em] tabular-nums" aria-label={`Code ${c.code.split("").join(" ")}`}>
              {c.code}
            </span>
            <div className="flex gap-2">
              {c.codeSentAt ? (
                <span className="self-center text-xs text-fg-muted">Code donné</span>
              ) : (
                <button type="button" disabled={pending} onClick={() => run(() => claimCodeSentAction(c.id))} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-bg-muted">
                  Code donné
                </button>
              )}
              <button type="button" disabled={pending} onClick={() => run(() => refuseClaimAction(c.id))} className="rounded-lg border border-border px-3 py-1.5 text-sm text-danger hover:bg-bg-muted">
                Refuser
              </button>
            </div>
          </li>
        ))}
      </ul>
      {message ? (
        <p role="status" className={`mt-2 text-sm ${message.ok ? "text-fg-muted" : "text-danger"}`}>
          {message.message}
        </p>
      ) : null}
    </section>
  );
}

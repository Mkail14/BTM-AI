"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { COMMUNES, STATUSES } from "@/lib/entreprises/listing";
import { normalize } from "@/lib/live/intent";
import type { ListingSummary } from "@/server/services/entreprises/listings";

const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" });

/** Plus d'un an sans vérification : à revoir lors de la prochaine tournée. */
const isOld = (verifiedOn: string | null) => !verifiedOn || Date.now() - Date.parse(verifiedOn) > 365 * 86_400_000;

export function ListingsTable({ listings }: { listings: ListingSummary[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"toutes" | "brouillons" | "a_revoir" | "tenues">("toutes");

  const shown = useMemo(() => {
    const q = normalize(query.trim());
    return listings.filter(
      (l) =>
        (!q || normalize(`${l.name} ${l.category ?? ""} ${l.commune ? COMMUNES[l.commune] : ""}`).includes(q)) &&
        (filter === "toutes" ||
          (filter === "brouillons" && !l.published) ||
          (filter === "a_revoir" && isOld(l.verifiedOn)) ||
          (filter === "tenues" && l.ownerId !== null)),
    );
  }, [listings, query, filter]);

  const counts = {
    toutes: listings.length,
    brouillons: listings.filter((l) => !l.published).length,
    a_revoir: listings.filter((l) => isOld(l.verifiedOn)).length,
    tenues: listings.filter((l) => l.ownerId !== null).length,
  };
  const labels = { toutes: "Toutes", brouillons: "Brouillons", a_revoir: "À revérifier", tenues: "Tenues par l'entreprise" };

  return (
    <section className="rounded-xl border border-border bg-bg p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Chercher un nom, une activité, une commune"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(labels) as (keyof typeof labels)[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-xs ${filter === f ? "border-accent bg-accent text-accent-fg" : "border-border hover:bg-bg-muted"}`}
            >
              {labels[f]} · {counts[f]}
            </button>
          ))}
        </div>
      </div>

      {shown.length ? (
        <ul className="mt-4 divide-y divide-border">
          {shown.map((l) => (
            <li key={l.id}>
              <Link href={`/admin/entreprises/${l.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-bg-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.name}</span>
                  <span className="block truncate text-xs text-fg-muted">
                    {[l.category, l.commune ? COMMUNES[l.commune] : null, l.phones ? `${l.phones} numéro${l.phones > 1 ? "s" : ""}` : "aucun numéro"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5 text-xs">
                  {!l.published ? <span className="rounded-full bg-bg-muted px-2 py-0.5">Brouillon</span> : null}
                  {l.status !== "ouvert" ? <span className="rounded-full bg-warning-soft px-2 py-0.5">{STATUSES[l.status]}</span> : null}
                  {l.ownerId ? <span className="rounded-full bg-success-soft px-2 py-0.5">Tenue par l&apos;entreprise</span> : null}
                  <span className={`rounded-full px-2 py-0.5 ${isOld(l.verifiedOn) ? "bg-danger/10 text-danger" : "bg-bg-muted"}`}>
                    {l.verifiedOn ? `Vérifiée ${monthFormat.format(new Date(l.verifiedOn))}` : "Jamais vérifiée"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-fg-muted">{listings.length ? "Aucune fiche ne correspond." : "Aucune fiche pour l'instant. Commencez par « Nouvelle fiche »."}</p>
      )}
    </section>
  );
}

import Link from "next/link";
import { COMMUNES, STATUSES } from "@/lib/entreprises/listing";
import { LISTINGS_PER_PAGE, type ListingFilter, type ListingSummary } from "@/server/services/entreprises/listings";

const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" });

/** Plus d'un an sans vérification : à revoir lors de la prochaine tournée. */
const isOld = (verifiedOn: string | null) => !verifiedOn || Date.now() - Date.parse(verifiedOn) > 365 * 86_400_000;

const LABELS: Record<ListingFilter, string> = {
  toutes: "Toutes",
  completes: "Complètes",
  a_completer: "À compléter",
  brouillons: "Brouillons",
  a_revoir: "À revérifier",
  tenues: "Tenues par l'entreprise",
};

type Props = {
  listings: ListingSummary[];
  found: number;
  counts: Record<ListingFilter, number>;
  query: string;
  filter: ListingFilter;
  page: number;
};

/** Liste des fiches : recherche, filtres et pages lus par le serveur (des dizaines de milliers de fiches). */
export function ListingsTable({ listings, found, counts, query, filter, page }: Props) {
  const href = (f: ListingFilter, p = 1) => {
    const s = new URLSearchParams();
    if (query) s.set("q", query);
    if (f !== "toutes") s.set("filtre", f);
    if (p > 1) s.set("page", String(p));
    const qs = s.toString();
    return `/admin/entreprises${qs ? `?${qs}` : ""}`;
  };
  const pages = Math.max(1, Math.ceil(found / LISTINGS_PER_PAGE));

  return (
    <section className="rounded-xl border border-border bg-bg p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <form method="get" action="/admin/entreprises" className="flex min-w-0 flex-1 gap-2">
          {filter !== "toutes" ? <input type="hidden" name="filtre" value={filter} /> : null}
          <input
            type="search"
            name="q"
            placeholder="Chercher un nom, une activité, une commune, un SIRET"
            defaultValue={query}
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-lg border border-border px-3 text-sm hover:bg-bg-muted">
            Chercher
          </button>
        </form>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(LABELS) as ListingFilter[]).map((f) => (
            <Link
              key={f}
              href={href(f)}
              aria-current={filter === f ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-xs ${filter === f ? "border-accent bg-accent text-accent-fg" : "border-border hover:bg-bg-muted"}`}
            >
              {LABELS[f]} · {counts[f].toLocaleString("fr-FR")}
            </Link>
          ))}
        </div>
      </div>

      {listings.length ? (
        <ul className="mt-4 divide-y divide-border">
          {listings.map((l) => (
            <li key={l.id}>
              <Link href={`/admin/entreprises/${l.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-bg-muted/50">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.name}</span>
                  <span className="block truncate text-xs text-fg-muted">
                    {[l.category, l.commune ? COMMUNES[l.commune] : null, l.phones ? `${l.phones} numéro${l.phones > 1 ? "s" : ""}` : "aucun numéro"].filter(Boolean).join(" · ")}
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5 text-xs">
                  <span className={`rounded-full px-2 py-0.5 ${l.complete ? "bg-success-soft" : "bg-warning-soft"}`}>{l.complete ? "Complète" : "À compléter"}</span>
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
        <p className="mt-4 text-sm text-fg-muted">{counts.toutes || query ? "Aucune fiche ne correspond." : "Aucune fiche pour l'instant. Commencez par « Nouvelle fiche »."}</p>
      )}

      {pages > 1 ? (
        <nav className="mt-4 flex items-center justify-between gap-3 text-sm" aria-label="Pages">
          {page > 1 ? (
            <Link href={href(filter, page - 1)} className="rounded-full border border-border px-4 py-1.5 hover:bg-bg-muted">
              Précédente
            </Link>
          ) : (
            <span />
          )}
          <span className="text-fg-muted">
            Page {page} sur {pages.toLocaleString("fr-FR")} · {found.toLocaleString("fr-FR")} fiches
          </span>
          {page < pages ? (
            <Link href={href(filter, page + 1)} className="rounded-full border border-border px-4 py-1.5 hover:bg-bg-muted">
              Suivante
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </section>
  );
}

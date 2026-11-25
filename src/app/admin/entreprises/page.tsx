import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning } from "@/components/admin/form";
import { requireAdmin } from "@/server/middlewares/session";
import { LISTING_FILTERS, searchListings, type ListingFilter } from "@/server/services/entreprises/listings";
import { listPendingClaims } from "@/server/services/entreprises/claims";
import { ClaimsList } from "./ClaimsList";
import { ListingsTable } from "./ListingsTable";

export const metadata: Metadata = { title: "Entreprises", robots: { index: false, follow: false } };

type Search = Promise<{ q?: string; filtre?: string; page?: string }>;

/** Annuaire des entreprises : les fiches relevées par l'équipe, et les demandes de rattachement à traiter. */
export default async function AdminEntreprisesPage({ searchParams }: { searchParams: Search }) {
  const { user } = await requireAdmin("/admin/entreprises");
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 80);
  const filter: ListingFilter = LISTING_FILTERS.includes(params.filtre as ListingFilter) ? (params.filtre as ListingFilter) : "toutes";
  const page = Math.min(10_000, Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1));
  const [result, claims] = await Promise.all([searchListings(query, filter, page), listPendingClaims()]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Entreprises" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">Annuaire des entreprises</h1>
            <p className="mt-1 text-sm text-fg-muted">
              Les vraies infos relevées par l&apos;équipe. Tamilya ne lit que les fiches publiées, et les donne avant tout le reste. « Complète » : activité, commune,
              adresse, numéro et horaires remplis.
            </p>
          </div>
          <Link href="/admin/entreprises/nouvelle" className="btn-rose inline-flex h-10 items-center rounded-full px-5 text-sm font-medium">
            Nouvelle fiche
          </Link>
        </header>
        {result ? null : <MigrationWarning file="20261226000000_annuaire_entreprises.sql" />}
        {claims?.length ? <ClaimsList claims={claims} /> : null}
        <ListingsTable
          listings={result?.listings ?? []}
          found={result?.found ?? 0}
          counts={result?.counts ?? { toutes: 0, completes: 0, a_completer: 0, brouillons: 0, a_revoir: 0, tenues: 0 }}
          query={query}
          filter={filter}
          page={page}
        />
      </main>
    </div>
  );
}

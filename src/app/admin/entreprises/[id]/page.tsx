import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ListingForm } from "@/components/entreprises/ListingForm";
import { ListingStatsView } from "@/components/entreprises/ListingStatsView";
import { requireAdmin } from "@/server/middlewares/session";
import { getListing, listingStats } from "@/server/services/entreprises/listings";
import { formValuesOf, frenchDay, listingSource } from "@/lib/entreprises/listing";
import { saveListingAction } from "../actions";
import { ListingDangerZone } from "./ListingDangerZone";

export const metadata: Metadata = { title: "Fiche entreprise", robots: { index: false, follow: false } };

export default async function AdminListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireAdmin(`/admin/entreprises/${id}`);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const listing = await getListing(id);
  if (!listing) notFound();
  const stats = await listingStats(id);

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Entreprises" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        <Link href="/admin/entreprises" className="text-sm text-fg-muted hover:text-fg">
          ← Annuaire
        </Link>
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{listing.name}</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Ce que dit Tamilya : « {listingSource(listing)} ».
            {listing.ownerId ? " L'entreprise tient sa fiche : ses changements s'affichent sans validation." : null}
            {listing.verifiedOn ? ` Dernière vérification de l'équipe : ${frenchDay(listing.verifiedOn)}.` : null}
          </p>
        </header>
        <section className="rounded-xl border border-border bg-bg p-4 sm:p-5">
          <ListingForm team initial={formValuesOf(listing, true)} save={saveListingAction.bind(null, listing.id)} />
        </section>
        <section className="rounded-xl border border-border bg-bg p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">Demandes à Tamilya</h2>
          <ListingStatsView stats={stats} />
        </section>
        <ListingDangerZone id={listing.id} owned={listing.ownerId !== null} />
      </main>
    </div>
  );
}

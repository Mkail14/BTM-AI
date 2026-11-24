import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { ListingForm } from "@/components/entreprises/ListingForm";
import { requireAdmin } from "@/server/middlewares/session";
import { BLANK_LISTING } from "@/lib/entreprises/listing";
import { saveListingAction } from "../actions";

export const metadata: Metadata = { title: "Nouvelle entreprise", robots: { index: false, follow: false } };

export default async function NewListingPage() {
  const { user } = await requireAdmin("/admin/entreprises/nouvelle");
  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Entreprises" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        <Link href="/admin/entreprises" className="text-sm text-fg-muted hover:text-fg">
          ← Annuaire
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nouvelle fiche</h1>
        <section className="rounded-xl border border-border bg-bg p-4 sm:p-5">
          <ListingForm
            team
            initial={BLANK_LISTING}
            save={saveListingAction.bind(null, null)}
            saveLabel="Créer la fiche"
          />
        </section>
      </main>
    </div>
  );
}

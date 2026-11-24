import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { requireAdmin } from "@/server/middlewares/session";
import { getTerritorialOffersWithApply } from "@/server/services/live/emploi-territorial-candidature";
import { ApplyList } from "./ApplyList";

export const metadata: Metadata = { title: "Candidatures", robots: { index: false, follow: false } };
/** Première lecture : une page par offre (environ 80), gardées ensuite 24 h. */
export const maxDuration = 60;

/**
 * ESSAI ADMIN : postuler aux offres Emploi Territorial de Mayotte depuis Tamilya.
 * Pas montré au public tant que le GIP Informatique des CDG n'a pas donné son accord.
 */
export default async function AdminCandidaturesPage() {
  const { user } = await requireAdmin("/admin/candidatures");
  let offers: Awaited<ReturnType<typeof getTerritorialOffersWithApply>> = [];
  let error: string | null = null;
  try {
    offers = await getTerritorialOffersWithApply();
  } catch (e) {
    error = e instanceof Error ? e.message : "Emploi Territorial ne répond pas.";
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Candidatures" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        <header className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Postuler aux offres Emploi Territorial</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Essai réservé aux admins : pour chaque offre de Mayotte, comment postuler, lu sur la page de l&apos;offre. À ne pas ouvrir au public sans l&apos;accord
            d&apos;Emploi Territorial.
          </p>
        </header>
        {error ? <p className="rounded-xl border border-border bg-bg p-4 text-sm">Offres indisponibles : {error}</p> : <ApplyList offers={offers} />}
      </main>
    </div>
  );
}

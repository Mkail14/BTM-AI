import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND } from "@/components/brand/brand";
import { getSiteFlags } from "@/lib/site/settings";
import { AdminSignIn } from "./AdminSignIn";

export const metadata: Metadata = { title: "Maintenance en cours", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Page de maintenance : le proxy l'affiche à la place de tout le site (même
 * adresse, code 503) pour tous sauf les administrateurs. Jamais de redirection
 * ici : juste après une réouverture, le proxy et cette page peuvent lire l'état
 * à quelques secondes d'écart, et une redirection tournerait en boucle.
 * Sans script : le bouton « Réessayer » est un simple lien (connexion faible).
 */
export default async function MaintenancePage() {
  const { maintenance, maintenanceMessage } = await getSiteFlags();

  return (
    <div className="relative flex min-h-dvh flex-col bg-bg-subtle">
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      <header className="relative z-10 flex h-14 items-center justify-center px-4 pt-[env(safe-area-inset-top)]">
        <BrandLogo size="md" />
      </header>

      <main
        id="contenu"
        className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))]"
      >
        <div className="rounded-3xl border border-border bg-bg/90 p-6 shadow-[0_20px_50px_-24px_rgba(16,24,40,0.25)] backdrop-blur sm:p-8">
          {maintenance ? (
            <>
              <p className="inline-flex items-center gap-2 rounded-full bg-warning-soft px-3 py-1 text-xs font-semibold text-warning">
                <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-warning motion-reduce:animate-none" />
                Maintenance en cours
              </p>
              <h1 className="mt-4 text-[1.65rem] leading-tight font-semibold tracking-tight text-balance">
                Tamilya revient très vite
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">
                Nous améliorons le service. Tamilya est temporairement indisponible : vos conversations et vos informations
                sont conservées, rien n&apos;est perdu.
              </p>
              {maintenanceMessage ? (
                <div className="mt-5 rounded-2xl border border-border bg-bg-subtle px-4 py-3">
                  <p className="text-xs font-medium text-fg-muted">Message de l&apos;équipe</p>
                  <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-line">{maintenanceMessage}</p>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                Service disponible
              </p>
              <h1 className="mt-4 text-[1.65rem] leading-tight font-semibold tracking-tight text-balance">Tamilya est de retour</h1>
              <p className="mt-3 text-[15px] leading-relaxed text-fg-muted">La maintenance est terminée, vous pouvez reprendre.</p>
            </>
          )}

          {/* Lien et non bouton : marche sans JavaScript ; prefetch coupé, la page doit être redemandée. */}
          <Link href="/" prefetch={false} className="btn-rose mt-6 h-12 w-full rounded-2xl text-[15px] font-semibold">
            {maintenance ? "Réessayer" : "Ouvrir Tamilya"}
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-fg-muted">
          {BRAND.parent} · Mayotte
          <span aria-hidden="true"> · </span>
          <AdminSignIn />
        </p>
      </main>
    </div>
  );
}

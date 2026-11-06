import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND } from "@/components/brand/brand";
import { getSiteFlags } from "@/lib/site/settings";
import type { SiteStatus } from "@/lib/site/status";
import { AdminSignIn } from "./AdminSignIn";

export const dynamic = "force-dynamic";

const COPY: Record<SiteStatus, { tabTitle: string; title: string; lead: string }> = {
  maintenance: {
    tabTitle: "Maintenance en cours",
    title: "Tamilya est en travaux.",
    lead: "Rien n'est perdu : tes conversations et tes informations sont gardées. Réessaie dans un moment.",
  },
  waiting_partner: {
    tabTitle: "Bientôt disponible",
    title: "Tamilya arrive bientôt.",
    lead: "Le site ouvrira dès que notre premier partenaire à Mayotte sera validé.",
  },
  online: { tabTitle: "Tamilya", title: "Tamilya est de retour.", lead: "Les travaux sont finis, tu peux reprendre." },
};

export async function generateMetadata(): Promise<Metadata> {
  const { status } = await getSiteFlags();
  return { title: COPY[status].tabTitle, robots: { index: false, follow: false } };
}

/**
 * Page d'attente (maintenance ou attente d'un partenaire) : le proxy l'affiche à la place de tout le site (même
 * adresse, code 503) pour tous sauf les administrateurs. Jamais de redirection
 * ici : juste après une réouverture, le proxy et cette page peuvent lire l'état
 * à quelques secondes d'écart, et une redirection tournerait en boucle.
 * Sans script : le bouton « Réessayer » est un simple lien (connexion faible).
 */
export default async function MaintenancePage() {
  const { status, maintenanceMessage } = await getSiteFlags();
  const copy = COPY[status];

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr] bg-bg lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:grid-rows-1">
      {/* Fond rose sous la photo : la page reste habillée si l'image tarde (connexion faible). */}
      <div aria-hidden="true" className="h-[30dvh] min-h-36 bg-accent bg-[url(/fond/eau-rose.webp)] bg-cover bg-center lg:order-2 lg:h-auto" />

      <main
        id="contenu"
        className="flex flex-col px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-10 lg:px-16 lg:pt-10 lg:pb-10"
      >
        <BrandLogo size="md" className="self-start" />

        <div className="my-auto max-w-lg py-10">
          <h1 className="text-[clamp(2.75rem,6vw,4.5rem)] leading-[1.02] font-semibold tracking-[-0.035em] text-balance">
            {copy.title}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-fg-muted">{copy.lead}</p>
          {status !== "online" && maintenanceMessage ? (
            <p className="mt-6 border-t border-border pt-4 text-[15px] leading-relaxed whitespace-pre-line">{maintenanceMessage}</p>
          ) : null}

          {/* Lien et non bouton : marche sans JavaScript ; prefetch coupé, la page doit être redemandée. */}
          {status === "waiting_partner" ? (
            <a
              href="mailto:contact@btm.yt?subject=Devenir%20partenaire%20de%20Tamilya"
              className="btn-rose mt-8 h-12 w-full rounded-2xl px-8 text-[15px] font-semibold sm:w-auto"
            >
              Devenir partenaire
            </a>
          ) : (
            <Link href="/" prefetch={false} className="btn-rose mt-8 h-12 w-full rounded-2xl px-8 text-[15px] font-semibold sm:w-auto">
              {status === "maintenance" ? "Réessayer" : "Ouvrir Tamilya"}
            </Link>
          )}
        </div>

        <p className="text-xs text-fg-muted">
          {BRAND.parent} · Mayotte
          <span aria-hidden="true"> · </span>
          <AdminSignIn />
        </p>
      </main>
    </div>
  );
}

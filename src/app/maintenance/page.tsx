import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { BRAND } from "@/components/brand/brand";
import { getSiteFlags } from "@/lib/site/settings";
import type { SiteStatus } from "@/lib/site/status";
import { AdminSignIn } from "./AdminSignIn";
import { TamilyaGlobe } from "./TamilyaGlobe";
import "./atelier.css";

export const dynamic = "force-dynamic";

const COPY: Record<SiteStatus, { tabTitle: string; badge: string | null; title: string; lead: string; steps: string[] }> = {
  maintenance: {
    tabTitle: "Maintenance en cours",
    badge: "Maintenance en cours",
    title: "Tamilya est en travaux.",
    lead: "Rien n'est perdu : tes conversations et tes informations sont gardées.",
    steps: ["Mise à jour en cours", "Vérifications", "Derniers réglages"],
  },
  waiting_partner: {
    tabTitle: "Bientôt disponible",
    badge: "Ouverture en préparation",
    title: "Tamilya arrive bientôt.",
    // Dit à quoi sert Tamilya : c'est la page d'accueil du moment, que Google lit pour valider la connexion avec Google.
    lead: "Tamilya, l'assistante IA de GROUPE BTM, répond à tes questions en français et en shimaoré et t'aide au quotidien à Mayotte : démarches, documents, trajets. Le site ouvrira dès que notre premier partenaire sera validé.",
    steps: ["Tamilya se prépare", "Derniers réglages", "En attente du premier partenaire"],
  },
  online: { tabTitle: "Tamilya", badge: null, title: "Tamilya est de retour.", lead: "Les travaux sont finis, tu peux reprendre.", steps: [] },
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
 * Sans script, le texte et le bouton « Réessayer », un simple lien, restent là (connexion faible).
 * Page simple : elle tient toujours dans l'écran, sans défilement.
 */
export default async function MaintenancePage() {
  const { status, maintenanceMessage } = await getSiteFlags();
  const copy = COPY[status];
  const button = "btn-rose h-11 shrink-0 rounded-2xl px-8 text-[15px] font-semibold";

  return (
    <main
      id="contenu"
      className="isolate grid h-dvh grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-bg px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-10"
    >
      <div aria-hidden="true" className="fond-lagon fond-lagon--page atelier-lagon" />
      <BrandLogo size="md" className="self-start justify-self-start" />

      <div className="atelier-layout min-h-0">
        <div className="atelier-text">
        {copy.badge ? <p className="atelier-status">{copy.badge}</p> : null}
        <h1 className="text-[clamp(1.6rem,6dvh,3.25rem)] leading-[1.05] font-semibold tracking-[-0.03em] text-balance">{copy.title}</h1>
        <p className="max-w-md text-[clamp(0.9rem,2.2dvh,1.125rem)] leading-snug text-fg-muted">{copy.lead}</p>
        {copy.steps.length ? (
          <>
            <p className="atelier-line">
              {maintenanceMessage ? (
                <>
                  <span className="line-clamp-2 min-w-0 font-medium text-fg">{maintenanceMessage}</span>
                  <span aria-hidden="true">·</span>
                </>
              ) : null}
              <span className="atelier-steps" aria-hidden="true">
                {copy.steps.map((step) => (
                  <span key={step}>{step}</span>
                ))}
              </span>
            </p>
            <div className="atelier-bar" aria-hidden="true" />
          </>
        ) : null}

        {/* Lien et non bouton : marche sans JavaScript ; prefetch coupé, la page doit être redemandée. */}
        {status === "waiting_partner" ? (
          <a href="mailto:contact@btm.yt?subject=Devenir%20partenaire%20de%20Tamilya" className={button}>
            Devenir partenaire
          </a>
        ) : (
          <Link href="/" prefetch={false} className={button}>
            {status === "maintenance" ? "Réessayer" : "Ouvrir Tamilya"}
          </Link>
        )}
        </div>
        <TamilyaGlobe />
      </div>

      <p className="pt-1 text-center text-xs text-fg-muted">
        {BRAND.parent} · Mayotte
        <span aria-hidden="true"> · </span>
        <Link href="/conditions" prefetch={false} className="hover:underline">
          Conditions
        </Link>
        <span aria-hidden="true"> · </span>
        <Link href="/confidentialite" prefetch={false} className="hover:underline">
          Confidentialité
        </Link>
        <span aria-hidden="true"> · </span>
        <AdminSignIn signupClosed={status === "maintenance"} />
      </p>
    </main>
  );
}

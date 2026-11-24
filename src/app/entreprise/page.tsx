import type { Metadata } from "next";
import Link from "next/link";
import { DevShell, card } from "@/app/developpeurs/ui";
import { ListingForm } from "@/components/entreprises/ListingForm";
import { ListingStatsView } from "@/components/entreprises/ListingStatsView";
import { getAuthContext } from "@/server/middlewares/session";
import { canUse } from "@/server/services/site/features";
import { listingStats, listOwnedListings } from "@/server/services/entreprises/listings";
import { listMyClaims } from "@/server/services/entreprises/claims";
import { listAccountWidgets } from "@/server/services/entreprises/widgets";
import { formValuesOf, listingSource } from "@/lib/entreprises/listing";
import { saveOwnListingAction } from "./actions";
import { ClaimFlow, SignInToClaim } from "./ClaimFlow";
import { WidgetLinks } from "./WidgetLinks";

export const metadata: Metadata = {
  title: "Espace entreprise",
  description: "Votre entreprise dans Tamilya : vos vraies informations, gratuitement. Modifiez votre fiche et voyez combien de fois on vous demande.",
};

const TABS = [
  { id: "fiche", label: "Ma fiche" },
  { id: "chiffres", label: "Mes chiffres" },
  { id: "chatbot", label: "Mon chatbot" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const page = "mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-10";

/**
 * Espace entreprise : l'entreprise prend la main sur la fiche relevée par GROUPE BTM (SIRET,
 * puis code donné au numéro de la fiche), la modifie sans validation, voit combien de fois
 * Tamilya l'a donnée et relie son chatbot. Gratuit.
 */
export default async function EntreprisePage({ searchParams }: { searchParams: Promise<{ fiche?: string; onglet?: string }> }) {
  const [{ user }, params] = await Promise.all([getAuthContext(), searchParams]);
  const open = await canUse(user, "entreprises");

  if (!open) {
    return (
      <DevShell>
        <section className={page}>
          <h1 className="landing-h2">Espace entreprise</h1>
          <p className="text-fg-muted">Bientôt : votre entreprise dans Tamilya, avec vos vraies informations. Gratuit.</p>
        </section>
      </DevShell>
    );
  }

  if (!user) {
    return (
      <DevShell>
        <section className={`${page} items-start`}>
          <p className="landing-eyebrow">Espace entreprise</p>
          <h1 className="landing-title">
            Votre entreprise, <span className="landing-accent">bien dite</span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
            Quand quelqu&apos;un demande votre numéro ou vos horaires à Tamilya, elle donne ceux que notre équipe a vérifiés sur place. Prenez la main sur votre fiche : vous la changez quand vous voulez, vous voyez combien de fois on vous demande. C&apos;est gratuit.
          </p>
          <SignInToClaim />
        </section>
      </DevShell>
    );
  }

  const [owned, claims] = await Promise.all([listOwnedListings(user.id), listMyClaims(user.id)]);
  if (owned === null) {
    return (
      <DevShell>
        <section className={page}>
          <h1 className="landing-h2">Espace entreprise</h1>
          <p className="text-fg-muted">L&apos;espace est indisponible pour le moment. Réessayez plus tard.</p>
        </section>
      </DevShell>
    );
  }

  if (!owned.length || params.fiche === "ajouter") {
    return (
      <DevShell>
        <section className={page}>
          <div>
            <h1 className="landing-h2">Prenez la main sur votre fiche</h1>
            <p className="mt-2 text-fg-muted">Notre équipe a déjà relevé les informations de votre entreprise. Trouvez-la, puis prouvez qu&apos;elle est à vous.</p>
          </div>
          <div className={card}>
            <ClaimFlow claims={claims} />
          </div>
          {owned.length ? (
            <Link href="/entreprise" className="text-sm text-fg-muted underline underline-offset-4">
              Retour à ma fiche
            </Link>
          ) : null}
        </section>
      </DevShell>
    );
  }

  const listing = owned.find((l) => l.id === params.fiche) ?? owned[0];
  const tab: Tab = TABS.some((t) => t.id === params.onglet) ? (params.onglet as Tab) : "fiche";
  const href = (t: Tab) => `/entreprise?${new URLSearchParams({ ...(owned.length > 1 && { fiche: listing.id }), ...(t !== "fiche" && { onglet: t }) })}`;
  const [stats, widgets] = await Promise.all([tab === "chiffres" ? listingStats(listing.id) : null, tab === "chatbot" ? listAccountWidgets(user.id) : null]);

  return (
    <DevShell>
      <section className={page}>
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-fg-muted">Espace entreprise</p>
            <h1 className="landing-h2 truncate">{listing.name}</h1>
            <p className="mt-1 text-sm text-fg-muted">Tamilya dit : « {listingSource(listing)} ».</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            {owned.length > 1
              ? owned.map((l) => (
                  <Link key={l.id} href={`/entreprise?fiche=${l.id}`} className={`rounded-full border px-3 py-1 ${l.id === listing.id ? "border-accent" : "border-border hover:bg-bg-muted"}`}>
                    {l.name}
                  </Link>
                ))
              : null}
            <Link href="/entreprise?fiche=ajouter" className="rounded-full border border-border px-3 py-1 hover:bg-bg-muted">
              Ajouter une entreprise
            </Link>
          </div>
        </header>

        <nav aria-label="Rubriques" className="flex gap-1 border-b border-border">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={href(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`relative px-3 py-2 text-sm ${tab === t.id ? "font-medium after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent" : "text-fg-muted hover:text-fg"}`}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        <div className={card}>
          {tab === "fiche" ? (
            <ListingForm
              initial={formValuesOf(listing, false)}
              save={saveOwnListingAction.bind(null, listing.id)}
              footer={<p className="text-xs text-fg-muted">Vos changements s&apos;affichent tout de suite, sans validation. Vous êtes responsable de ce que vous écrivez.</p>}
            />
          ) : tab === "chiffres" ? (
            <ListingStatsView stats={stats} />
          ) : (
            <WidgetLinks widgets={widgets} listingId={listing.id} />
          )}
        </div>
      </section>
    </DevShell>
  );
}

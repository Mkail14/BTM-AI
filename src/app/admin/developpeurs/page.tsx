import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning } from "@/components/admin/form";
import { requireAdmin } from "@/server/middlewares/session";
import { developerEmail, listDeveloperAccounts } from "@/server/services/developers/accounts";
import { ReviewButtons } from "./ReviewButtons";

export const metadata: Metadata = { title: "Développeurs", robots: { index: false, follow: false } };

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Indian/Mayotte" });

/**
 * Développeurs qui ont pris l'engagement (API et widget de Tamilya). L'accès
 * s'ouvre sans validation ; ici on suspend ou on rétablit, par exemple après
 * une suspension automatique pour tentative de renommage.
 */
export default async function AdminDeveloppeursPage() {
  const { user } = await requireAdmin("/admin/developpeurs");
  const accounts = await listDeveloperAccounts();
  const details = await Promise.all((accounts ?? []).map(async (account) => ({ account, email: await developerEmail(account.userId) })));
  const suspended = details.filter((d) => d.account.status === "suspended").length;

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Développeurs" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Développeurs</h1>
          <p className="mt-1 text-sm text-fg-muted">
            {details.length} développeur{details.length > 1 ? "s" : ""}
            {suspended > 0 ? `, dont ${suspended} suspendu${suspended > 1 ? "s" : ""}` : ""}. L&apos;accès s&apos;ouvre dès
            que la fiche est remplie et l&apos;engagement pris (garder le nom, le shimaoré et la personnalité de Tamilya) ; une
            tentative de renommage le suspend automatiquement, avec un e-mail au développeur et à BTM.
          </p>
        </div>
        {accounts === null ? <MigrationWarning file="20261217000000_engagement_developpeurs.sql" /> : null}
        {accounts?.length === 0 ? <p className="text-sm text-fg-muted">Aucun développeur pour le moment.</p> : null}
        {details.map(({ account, email }) => (
          <section key={account.userId} className="rounded-xl border border-border bg-bg p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold">{account.profile ? `${account.profile.organization} · ${account.profile.fullName}` : "Fiche pas encore remplie"}</h2>
                <p className="text-sm break-all text-fg-muted">
                  {email ?? account.userId} · engagé le {date.format(new Date(account.acceptedAt))}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  account.status === "suspended" ? "bg-danger/15 text-danger" : "bg-success/15 text-success"
                }`}
              >
                {account.status === "suspended" ? "Suspendu" : "Actif"}
              </span>
            </div>
            {account.profile ? (
              <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[9rem_1fr]">
                <dt className="text-fg-muted">Site ou appli</dt>
                <dd className="break-all">{account.profile.website}</dd>
                <dt className="text-fg-muted">Ce qu&apos;il va faire</dt>
                <dd className="whitespace-pre-wrap">{account.profile.usage}</dd>
              </dl>
            ) : null}
            {account.reviewNote ? <p className="mt-2 text-sm text-fg-muted">Dernière décision : {account.reviewNote}</p> : null}
            <ReviewButtons userId={account.userId} status={account.status} />
          </section>
        ))}
      </main>
    </div>
  );
}

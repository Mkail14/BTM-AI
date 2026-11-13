import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { listDeveloperAccounts } from "@/lib/developers/accounts";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
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
  const admin = getSupabaseAdminClient();
  const details = await Promise.all(
    (accounts ?? []).map(async (account) => {
      const { data } = (await admin?.auth.admin.getUserById(account.userId)) ?? {};
      return { account, email: data?.user?.email ?? null };
    }),
  );
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
            l&apos;engagement à garder le nom, le shimaoré et la personnalité de Tamilya ; une tentative de renommage le suspend
            automatiquement.
          </p>
        </div>
        {accounts === null ? <MigrationWarning file="20261217000000_engagement_developpeurs.sql" /> : null}
        {accounts?.length === 0 ? <p className="text-sm text-fg-muted">Aucun développeur pour le moment.</p> : null}
        {details.map(({ account, email }) => (
          <section key={account.userId} className="rounded-xl border border-border bg-bg p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold break-all">{email ?? account.userId}</h2>
                <p className="text-sm text-fg-muted">Engagé le {date.format(new Date(account.acceptedAt))}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  account.status === "suspended" ? "bg-danger/15 text-danger" : "bg-success/15 text-success"
                }`}
              >
                {account.status === "suspended" ? "Suspendu" : "Actif"}
              </span>
            </div>
            {account.reviewNote ? <p className="mt-2 text-sm text-fg-muted">Dernière décision : {account.reviewNote}</p> : null}
            <ReviewButtons userId={account.userId} status={account.status} />
          </section>
        ))}
      </main>
    </div>
  );
}

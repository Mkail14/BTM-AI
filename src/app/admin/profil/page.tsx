import type { Metadata } from "next";
import Link from "next/link";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning } from "@/components/admin/form";
import { listAdmins } from "@/lib/admin/delegation";
import { requirePrincipalAdmin } from "@/lib/auth/session";
import { getBankDetails, getLastChange, getSiteFlags, getStatusLog } from "@/lib/site/settings";
import { unlockedUntil } from "@/lib/admin/unlock";
import { BankForm, Delegation, LockBar, ProfileLock, SitePanel } from "./ProfileForms";

export const metadata: Metadata = { title: "Profil de l'entreprise", robots: { index: false, follow: false } };

const changeFormat = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Indian/Mayotte",
});

/*
 * Un seul écran sur ordinateur : trois colonnes (site, RIB, délégation),
 * seule la liste des administrateurs défile dans son cadre. Sur petit
 * écran, les blocs s'empilent et la page défile normalement.
 */

/** Profil de GROUPE BTM : réservé à l'administrateur principal (404 pour les autres, délégués compris). */
export default async function AdminProfilePage() {
  const { user } = await requirePrincipalAdmin("/admin/profil");
  const [flags, bank, admins, change, statusLog] = await Promise.all([getSiteFlags({ fresh: true }), getBankDetails(), listAdmins(), getLastChange(), getStatusLog()]);
  const until = await unlockedUntil(user.id);
  const author = change?.by ? (admins?.find((a) => a.id === change.by)?.email ?? null) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle lg:h-dvh lg:overflow-hidden">
      <AdminHeader section="Profil" email={user.email} />
      <main
        id="contenu"
        className="mx-auto flex w-full max-w-[1400px] min-h-0 flex-1 flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <ProfileLock until={until}>
        <div className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <div>
            <Link href="/admin" className="mb-1 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
              <span aria-hidden="true">←</span> Tableau de bord
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">Profil de l&apos;entreprise</h1>
            <p className="text-sm text-fg-muted">GROUPE BTM · réservé à l&apos;administrateur principal</p>
          </div>
          {change ? (
            <p className="text-xs text-fg-muted">
              Modifié le {changeFormat.format(new Date(change.at))}
              {author ? ` par ${author}` : ""}
            </p>
          ) : null}
        </div>
        <LockBar />
        {bank ? null : <MigrationWarning file="20261114000000_site_settings.sql" />}
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
          <SitePanel flags={flags} log={statusLog} />
          <BankForm bank={bank ?? { holder: "", bankName: "", iban: "", bic: "" }} />
          <Delegation admins={admins} selfId={user.id} />
        </div>
        </ProfileLock>
      </main>
    </div>
  );
}

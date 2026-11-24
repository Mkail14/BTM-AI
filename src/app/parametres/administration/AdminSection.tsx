import Link from "next/link";
import { IconLock } from "@/components/ui/icons";
import { ADMIN_LOCK_PATH, adminGateOpen } from "@/server/services/admin/gate";
import { listAdmins } from "@/server/services/admin/delegation";
import { unlockedUntil } from "@/server/services/admin/unlock";
import { getAnnouncement } from "@/server/services/site/announcement";
import { listPartners } from "@/server/services/site/partners";
import { getSiteFlags, getStatusLog } from "@/server/services/site/settings";
import { AdminTabs, AnnouncementPanel, Delegation, LockBar, PartnersPanel, ProfileLock, SitePanel, type AdminTab } from "./AdminPanels";
import { ChangeCode } from "./ChangeCode";
import { PRIMARY } from "../ui";

const HERE = "/parametres?rubrique=administration";

/**
 * Rubrique Administration de Mon compte, gardée par le code d'accès admin, en
 * onglets. Principal : site, partenaires, bandeau et délégués. Délégué : la liste des
 * adresses des administrateurs, sans rien pouvoir changer. Tous : changer
 * d'application d'authentification.
 */
export async function AdminSection({ userId, principal }: { userId: string; principal: boolean }) {
  if (!(await adminGateOpen(userId))) {
    // Le lien du code ramène ici (src/app/admin/verrou/page.tsx l'autorise).
    const lockHref = `${ADMIN_LOCK_PATH}?suite=${encodeURIComponent(HERE)}`;
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-bg px-6 py-8 text-center">
        <span className="grid size-11 place-items-center rounded-full bg-accent-soft text-accent">
          <IconLock width={20} height={20} />
        </span>
        <p className="text-sm text-fg-muted">Tape ton code d&apos;accès admin pour voir cette rubrique.</p>
        <Link href={lockHref} className={`${PRIMARY} inline-flex items-center`}>
          Entrer le code
        </Link>
      </div>
    );
  }

  const [admins, flags, log, partners, announcement, until] = await Promise.all([
    listAdmins(),
    principal ? getSiteFlags({ fresh: true }) : null,
    principal ? getStatusLog() : null,
    principal ? listPartners() : null,
    principal ? getAnnouncement({ fresh: true }) : null,
    principal ? unlockedUntil(userId) : null,
  ]);

  const tabs: AdminTab[] = [
    ...(principal && flags
      ? ([
          {
            id: "site",
            label: "Site",
            alert: flags.status !== "online" || flags.demoMode,
            content: <SitePanel flags={flags} log={log} partners={partners} />,
          },
          { id: "partners", label: "Partenaires", content: <PartnersPanel partners={partners} status={flags.status} /> },
          { id: "banner", label: "Bandeau", content: <AnnouncementPanel announcement={announcement} /> },
        ] satisfies AdminTab[])
      : []),
    { id: "admins", label: "Admins", content: <Delegation admins={admins} selfId={userId} manage={principal} /> },
    { id: "code", label: "Code", content: <ChangeCode /> },
  ];

  return (
    <ProfileLock until={until}>
      {principal ? <LockBar /> : null}
      <AdminTabs tabs={tabs} />
    </ProfileLock>
  );
}

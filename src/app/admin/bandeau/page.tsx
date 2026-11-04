import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { getAnnouncement } from "@/lib/site/announcement";
import { NO_ANNOUNCEMENT } from "@/lib/site/announcement-rules";
import { AnnouncementForm } from "./AnnouncementForm";

export const metadata: Metadata = { title: "Bandeau d'accueil", robots: { index: false, follow: false } };

/** Bandeau sous la barre du haut de l'accueil : alerte, bon plan ou publicité, allumé ou éteint ici. */
export default async function AdminAnnouncementPage() {
  const { user } = await requireAdmin("/admin/bandeau");
  const announcement = await getAnnouncement({ fresh: true });

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Bandeau d'accueil" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        {announcement ? null : <MigrationWarning file="20261121000000_bandeau_accueil.sql" />}
        <AnnouncementForm saved={announcement ?? NO_ANNOUNCEMENT} />
      </main>
    </div>
  );
}

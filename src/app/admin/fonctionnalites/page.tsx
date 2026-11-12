import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { getFeatureSwitches } from "@/lib/site/features";
import { readSwitches } from "@/lib/site/features-rules";
import { FeatureSwitches } from "./FeatureSwitches";

export const metadata: Metadata = { title: "Fonctionnalités", robots: { index: false, follow: false } };

/** Un interrupteur par fonctionnalité : allumée pour tout le monde, ou réservée aux administrateurs. */
export default async function AdminFeaturesPage() {
  const { user } = await requireAdmin("/admin/fonctionnalites");
  const switches = await getFeatureSwitches({ fresh: true });

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Fonctionnalités" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        {switches ? null : <MigrationWarning file="20261210000000_fonctionnalites.sql" />}
        <FeatureSwitches saved={switches ?? readSwitches({})} />
      </main>
    </div>
  );
}

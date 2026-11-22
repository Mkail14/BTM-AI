import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft } from "@/components/ui/icons";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { requireAdmin } from "@/server/middlewares/session";
import { readStoredPlanning, readWaterAlerts } from "@/server/services/water/store";
import { findZone } from "@/lib/water/zones";
import type { WaterAlert, WaterPlanning } from "@/lib/water/schedule";
import { WaterAdmin } from "./WaterAdmin";

export const metadata: Metadata = { title: "Tours d'eau", robots: { index: false, follow: false } };
/** « Relire maintenant » : Gemini lit plusieurs images, jusqu'à 2 minutes. */
export const maxDuration = 300;

const unplaced = (planning: WaterPlanning | null) => planning?.sectors.flatMap((s) => s.villages).filter((name) => !findZone(name)) ?? [];

/** Planning officiel de la SMAE lu automatiquement (toutes les heures), et coupures annoncées hors planning. */
export default async function AdminWaterPage() {
  const { user } = await requireAdmin("/admin/eau");
  let planning: WaterPlanning | null = null;
  let alerts: WaterAlert[] = [];
  let error: string | null = null;
  try {
    [planning, alerts] = await Promise.all([readStoredPlanning(), readWaterAlerts()]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Stockage illisible.";
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Tours d'eau" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        <Link
          href="/admin/fonctionnalites"
          className="-mb-1 inline-flex items-center gap-1.5 self-start text-sm font-medium text-fg-muted hover:text-fg"
        >
          <IconArrowLeft width={15} height={15} /> Fonctionnalités
        </Link>
        {error ? (
          <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
            {error}
          </p>
        ) : null}
        <WaterAdmin planning={planning} alerts={alerts} unplaced={unplaced(planning)} />
      </main>
    </div>
  );
}

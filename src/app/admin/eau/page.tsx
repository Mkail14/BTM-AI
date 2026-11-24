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
/** « Relire maintenant » : lecture des images sans IA, moins d'une minute. */
export const maxDuration = 300;

/** Heure de la demande : état de chaque secteur « maintenant ». */
const requestTime = () => Date.now();

const unplaced = (planning: WaterPlanning | null) => planning?.sectors.flatMap((s) => s.villages).filter((name) => !findZone(name)) ?? [];

/** Planning officiel de la SMAE lu automatiquement (6 h et 18 h), et coupures annoncées hors planning : un seul écran. */
export default async function AdminWaterPage() {
  const { user } = await requireAdmin("/admin/eau");
  let planning: WaterPlanning | null = null;
  let alerts: WaterAlert[] = [];
  let error: string | null = null;
  const now = requestTime();
  try {
    [planning, alerts] = await Promise.all([readStoredPlanning(), readWaterAlerts()]);
  } catch (e) {
    error = e instanceof Error ? e.message : "Stockage illisible.";
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg-subtle">
      <AdminHeader section="Tours d'eau" email={user.email} />
      <main id="contenu" className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-3 overflow-y-auto p-4 *:shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-6">
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
        <WaterAdmin planning={planning} alerts={alerts} unplaced={unplaced(planning)} now={now} />
      </main>
    </div>
  );
}

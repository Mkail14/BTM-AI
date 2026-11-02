import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SimplePage } from "@/components/layout/SimplePage";
import { getSiteFlags } from "@/lib/site/settings";
import { AdminSignIn } from "./AdminSignIn";

export const metadata: Metadata = { title: "Site en maintenance", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Page d'attente affichée par le proxy à la place de tout le site pendant une maintenance. */
export default async function MaintenancePage() {
  const { maintenance, maintenanceMessage } = await getSiteFlags();
  if (!maintenance) redirect("/");
  return (
    <SimplePage title="Site en maintenance">
      <p className="text-sm text-fg-muted">
        BTM AI fait une petite pause pour s&apos;améliorer. Revenez un peu plus tard : Awa vous attend !
      </p>
      {maintenanceMessage ? <p className="mt-3 rounded-lg bg-bg-subtle px-3 py-2 text-sm">{maintenanceMessage}</p> : null}
      <AdminSignIn />
    </SimplePage>
  );
}

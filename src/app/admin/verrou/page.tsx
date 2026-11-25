import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { adminGateOpen, codeOffFromMetadata, idleFromMetadata, isAdminGatedPath } from "@/server/services/admin/gate";
import { safeNextPath } from "@/lib/auth/redirect";
import { requireUser } from "@/server/middlewares/session";
import { CodeForm } from "./CodeForm";
import { OpenWithoutCode } from "./OpenWithoutCode";

export const metadata: Metadata = { title: "Code d'accès", robots: { index: false, follow: false } };

/**
 * Entrée de l'espace admin : le code à 6 chiffres de l'application
 * d'authentification. La première fois, on y lie l'application (QR code).
 */
export default async function AdminLockPage({ searchParams }: { searchParams: Promise<{ suite?: string | string[] }> }) {
  const { supabase, user } = await requireUser("/admin/verrou");
  if (!user.isAdmin) notFound();

  const { suite } = await searchParams;
  const asked = safeNextPath(typeof suite === "string" ? suite : null, "/admin");
  // Retour possible aussi vers Mon compte (rubrique Administration, gardée par le même code).
  const askedPath = asked.split("?")[0];
  const next = isAdminGatedPath(askedPath) || askedPath === "/parametres" ? asked : "/admin";
  if (await adminGateOpen(user.id)) redirect(next);

  const [{ data }, { data: fresh }] = await Promise.all([supabase.auth.mfa.listFactors(), supabase.auth.getUser()]);
  const enrolled = Boolean(data?.all.some((f) => f.factor_type === "totp" && f.status === "verified"));
  // Code retiré (Mon compte, Sécurité) : l'admin s'ouvre tout seul, sans rien demander.
  if (!enrolled && codeOffFromMetadata(fresh.user?.app_metadata)) return <OpenWithoutCode next={next} />;

  return (
    <main className="persona-surface relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden="true" className="verrou-fond pointer-events-none fixed inset-0">
        <div className="fond-lagon fond-lagon--page" />
      </div>
      <div aria-hidden="true" className="persona-line pointer-events-none fixed inset-x-0 top-0 z-20 h-0.5" />
      <CodeForm enrolled={enrolled} next={next} email={user.email} minutes={idleFromMetadata(fresh.user?.app_metadata)} />
    </main>
  );
}

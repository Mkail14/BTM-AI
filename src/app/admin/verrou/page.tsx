import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ADMIN_IDLE_MINUTES, adminGateOpen, isAdminGatedPath } from "@/lib/admin/gate";
import { safeNextPath } from "@/lib/auth/redirect";
import { requireUser } from "@/lib/auth/session";
import { CodeForm } from "./CodeForm";

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
  const next = isAdminGatedPath(asked.split("?")[0]) ? asked : "/admin";
  if (await adminGateOpen(user.id)) redirect(next);

  const { data } = await supabase.auth.mfa.listFactors();
  const enrolled = Boolean(data?.all.some((f) => f.factor_type === "totp" && f.status === "verified"));

  return (
    <main className="grid min-h-dvh place-items-center bg-bg-muted px-4 py-10">
      <CodeForm enrolled={enrolled} next={next} email={user.email} minutes={ADMIN_IDLE_MINUTES} />
    </main>
  );
}

import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { IconMessage, IconMic } from "@/components/ui/icons";
import { getAuthContext } from "@/lib/auth/session";
import { getSiteFlags } from "@/lib/site/settings";
import { AdminAccountMenu } from "./AdminAccountMenu";
import { AdminMenu } from "./AdminMenu";

/**
 * Barre du haut de toutes les pages d'administration. À gauche : menu ☰, marque
 * et rubrique. À droite : état du site (maintenance, mode démo), accès à Awa
 * (écrire ou parler) et le compte (Profil de l'entreprise, déconnexion).
 * Sur téléphone, les libellés disparaissent pour tenir sur 375 px.
 */
export async function AdminHeader({ section }: { section?: string; email?: string | null }) {
  const [{ user }, flags] = await Promise.all([getAuthContext(), getSiteFlags()]);
  const principal = Boolean(user?.isPrincipalAdmin);
  const status = [
    flags.maintenance ? { label: "Maintenance", dot: "bg-warning", box: "bg-warning-soft text-warning" } : null,
    flags.demoMode ? { label: "Mode démo", dot: "bg-accent", box: "bg-accent-soft text-accent" } : null,
  ].filter((s) => s !== null);

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-3 md:px-4">
        <AdminMenu principal={principal} />
        <Link href="/admin" className={`${section ? "hidden sm:flex" : "flex"} shrink-0 items-center gap-2`}>
          <BrandLogo size="md" />
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">Admin</span>
        </Link>
        {section ? (
          <>
            <span aria-hidden="true" className="hidden text-border sm:inline">
              /
            </span>
            <span className="min-w-0 truncate text-sm font-medium">{section}</span>
          </>
        ) : null}

        <div className="ml-auto flex shrink-0 items-center gap-2 text-sm">
          {/* État du site : un clic mène au Profil pour l'éteindre. */}
          {status.map((s) => {
            const chip = (
              <>
                <span aria-hidden="true" className={`size-1.5 animate-pulse rounded-full ${s.dot}`} />
                {s.label}
              </>
            );
            const className = `hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold sm:inline-flex ${s.box}`;
            return principal ? (
              <Link key={s.label} href="/admin/profil" className={`${className} hover:brightness-95`}>
                {chip}
              </Link>
            ) : (
              <span key={s.label} className={className}>
                {chip}
              </span>
            );
          })}

          {/* Awa : écrire ou parler, en un seul bloc. */}
          <div className="flex items-center rounded-full border border-border p-0.5">
            <Link
              href="/"
              aria-label="Écrire à Awa"
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
            >
              <IconMessage width={16} height={16} /> <span className="hidden md:inline">Écrire</span>
            </Link>
            <Link
              href="/voix"
              aria-label="Parler à Awa"
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1.5 font-medium text-accent-fg hover:bg-accent-hover"
            >
              <IconMic width={16} height={16} /> <span className="hidden md:inline">Parler à Awa</span>
            </Link>
          </div>

          <span aria-hidden="true" className="h-6 w-px bg-border" />
          <AdminAccountMenu email={user?.email ?? null} principal={principal} />
        </div>
      </div>
    </header>
  );
}

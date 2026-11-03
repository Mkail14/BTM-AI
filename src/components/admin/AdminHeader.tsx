import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { IconMessage, IconMic } from "@/components/ui/icons";
import { getAuthContext } from "@/lib/auth/session";
import { getSiteFlags } from "@/lib/site/settings";
import { AdminAccountMenu } from "./AdminAccountMenu";
import { AdminMenu, AdminTabs } from "./AdminMenu";

/**
 * Barre du haut de toutes les pages d'administration, sur deux étages.
 * En haut : marque, état du site (maintenance, mode démo), accès à Tamilya et
 * compte. En dessous, sur grand écran : les rubriques en onglets. Sur petit
 * écran, les onglets laissent place au menu ☰ et au nom de la rubrique.
 */
export async function AdminHeader({ section }: { section?: string; email?: string | null }) {
  const [{ user }, flags] = await Promise.all([getAuthContext(), getSiteFlags()]);
  const principal = Boolean(user?.isPrincipalAdmin);
  const status = [
    flags.maintenance ? { label: "Maintenance", dot: "bg-warning" } : null,
    flags.demoMode ? { label: "Mode démo", dot: "bg-accent" } : null,
  ].filter((s) => s !== null);
  const ghost = "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium text-fg-muted hover:bg-bg-muted hover:text-fg";

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-bg/90 backdrop-blur">
      <div className="mx-auto max-w-[1600px] px-3 md:px-6">
        <div className="flex h-14 items-center gap-3">
          <AdminMenu principal={principal} />
          <Link href="/admin" className="flex shrink-0 items-center gap-2.5" aria-label="Tableau de bord">
            <BrandLogo size="sm" />
            <span className="text-sm font-medium text-fg-muted">Admin</span>
          </Link>
          {section ? (
            <span className="min-w-0 truncate text-sm font-medium lg:hidden">
              <span aria-hidden="true" className="mr-3 text-border">
                /
              </span>
              {section}
            </span>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            {/* État du site : un clic mène au Profil pour l'éteindre. */}
            {status.map((s) => {
              // Téléphone : la pastille seule (le libellé reste lu par les lecteurs d'écran), toujours visible.
              const chip = (
                <>
                  <span aria-hidden="true" className={`size-2 animate-pulse rounded-full motion-reduce:animate-none sm:size-1.5 ${s.dot}`} />
                  <span className="max-sm:sr-only">{s.label}</span>
                </>
              );
              const className =
                "mr-0.5 inline-flex items-center gap-2 rounded-full border border-border px-2.5 py-2 text-xs font-medium sm:mr-1 sm:px-3 sm:py-1";
              return principal ? (
                <Link key={s.label} href="/admin/profil" title={s.label} className={`${className} hover:bg-bg-muted`}>
                  {chip}
                </Link>
              ) : (
                <span key={s.label} title={s.label} className={className}>
                  {chip}
                </span>
              );
            })}

            <Link href="/" className={ghost} aria-label="Écrire à Tamilya">
              <IconMessage width={16} height={16} /> <span className="hidden md:inline">Ouvrir Tamilya</span>
            </Link>
            <Link href="/voix" className={ghost} aria-label="Parler à Tamilya" title="Parler à Tamilya">
              <IconMic width={16} height={16} />
            </Link>
            <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-border" />
            <AdminAccountMenu email={user?.email ?? null} principal={principal} />
          </div>
        </div>

        <div className="hidden lg:block">
          <AdminTabs />
        </div>
      </div>
    </header>
  );
}

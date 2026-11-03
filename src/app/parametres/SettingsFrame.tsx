import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { IconDashboard } from "@/components/ui/icons";

/**
 * Cadre des Paramètres : exactement la hauteur de l'écran, jamais de barre de
 * défilement sur la page (seul le panneau de la rubrique peut défiler).
 */
export function SettingsFrame({
  isAdmin = false,
  section = "Paramètres",
  children,
}: {
  isAdmin?: boolean;
  section?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle md:h-dvh md:overflow-hidden">
      <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-bg/95 backdrop-blur md:static md:bg-bg md:backdrop-blur-none">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href="/" aria-label="BTM AI — retour à la conversation" className="rounded">
            <BrandLogo size="md" />
          </Link>
          <span aria-hidden="true" className="text-border">
            /
          </span>
          <span className="text-sm font-medium">{section}</span>
          <div className="ml-auto flex items-center gap-1.5 text-sm">
            {isAdmin ? (
              <Link
                href="/admin"
                aria-label="Tableau de bord"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
              >
                <IconDashboard width={16} height={16} /> <span className="hidden sm:inline">Tableau de bord</span>
              </Link>
            ) : null}
            <Link
              href="/"
              className="rounded-full bg-accent px-3 py-1.5 font-medium text-accent-fg hover:bg-accent-hover"
            >
              Retour à Tamilya
            </Link>
          </div>
        </div>
      </header>
      <main id="contenu" className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-5 px-4 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:min-h-0 md:py-8">
        {children}
      </main>
    </div>
  );
}

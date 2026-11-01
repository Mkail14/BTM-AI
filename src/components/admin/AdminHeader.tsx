import Link from "next/link";
import { SignOutButton } from "@/app/parametres/SignOutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { IconMessage, IconMic } from "@/components/ui/icons";
import { AdminMenu } from "./AdminMenu";

/**
 * Barre du haut de toutes les pages d'administration : menu ☰, marque, rubrique,
 * puis à droite les accès à Awa et la déconnexion. Sur téléphone, les boutons
 * passent en icônes seules pour tenir sur 375 px.
 */
export function AdminHeader({ section }: { section?: string; email?: string | null }) {
  return (
    <header className="shrink-0 border-b border-border bg-bg">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-2 px-4">
        <AdminMenu />
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

        <div className="ml-auto flex shrink-0 items-center gap-1.5 text-sm">
          <Link
            href="/"
            aria-label="Écrire à Awa"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <IconMessage width={16} height={16} /> <span className="hidden md:inline">Écrire à Awa</span>
          </Link>
          <Link
            href="/voix"
            aria-label="Parler à Awa"
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 font-medium text-accent-fg hover:bg-accent-hover"
          >
            <IconMic width={16} height={16} /> <span className="hidden md:inline">Parler à Awa</span>
          </Link>
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <SignOutButton compact />
        </div>
      </div>
    </header>
  );
}

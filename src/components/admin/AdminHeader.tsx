import { SignOutButton } from "@/app/parametres/SignOutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AdminMenu } from "./AdminMenu";

/**
 * En-tête des pages d'administration : menu ☰, marque, titre de la rubrique, compte.
 * Téléphone : menu, titre de la rubrique et déconnexion seulement (la marque et
 * le badge feraient déborder l'en-tête sur un écran de 375 px).
 */
export function AdminHeader({ section, email }: { section: string; email: string | null }) {
  return (
    <header className="shrink-0 border-b border-border bg-bg">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
        <AdminMenu />
        <span className="hidden sm:block">
          <BrandLogo size="md" />
        </span>
        <span
          className={`shrink-0 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent ${section ? "hidden sm:inline" : ""}`}
        >
          Administration
        </span>
        {section ? (
          <>
            <span aria-hidden="true" className="hidden text-fg-muted sm:inline">
              /
            </span>
            <span className="min-w-0 truncate text-sm font-medium">{section}</span>
          </>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
          {email ? <span className="hidden max-w-56 truncate text-fg-muted lg:inline">{email}</span> : null}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

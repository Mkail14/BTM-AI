import { SignOutButton } from "@/app/parametres/SignOutButton";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { AdminMenu } from "./AdminMenu";

/** En-tête des pages d'administration : menu ☰, marque, titre de la rubrique, compte. */
export function AdminHeader({ section, email }: { section: string; email: string | null }) {
  return (
    <header className="shrink-0 border-b border-border bg-bg">
      <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-3 px-4">
        <AdminMenu />
        <BrandLogo size="md" />
        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">Administration</span>
        {section ? (
          <>
            <span aria-hidden="true" className="hidden text-fg-muted sm:inline">
              /
            </span>
            <span className="hidden truncate text-sm font-medium sm:inline">{section}</span>
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-3 text-sm">
          {email ? <span className="hidden truncate text-fg-muted md:inline">{email}</span> : null}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

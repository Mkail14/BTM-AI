import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";

/** Mise en page des pages secondaires (paramètres, compte, informations). */
export function SimplePage({
  title,
  wide = false,
  children,
}: {
  title: string;
  /** Contenu tabulaire (administration) : colonne plus large. */
  wide?: boolean;
  children: ReactNode;
}) {
  const width = wide ? "max-w-5xl" : "max-w-2xl";
  return (
    <div className="min-h-dvh bg-bg-subtle">
      <header className="border-b border-border bg-bg pt-[env(safe-area-inset-top)]">
        <div className={`mx-auto flex h-14 ${width} items-center justify-between px-4`}>
          <Link href="/" aria-label="BTM AI — retour à la conversation" className="rounded">
            <BrandLogo size="md" />
          </Link>
          <Link href="/" className="-mr-2 rounded-lg px-2 py-2.5 text-sm text-fg-muted hover:text-fg">
            ← Retour à la conversation
          </Link>
        </div>
      </header>
      <main id="contenu" className={`mx-auto ${width} px-4 pt-10 pb-28`}>
        {/* Espace en bas : le rond d'aide ne cache pas la fin du texte. */}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

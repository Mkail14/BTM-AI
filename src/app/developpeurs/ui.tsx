import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { LandingNav } from "@/components/landing/LandingNav";

/** Éléments communs aux pages Développeurs (style de l'accueil). */

export const roseButton = "btn-rose h-11 rounded-full px-6 text-[15px] font-medium";
export const ghostButton =
  "inline-flex h-11 items-center rounded-full border border-border bg-bg/60 px-6 text-[15px] font-medium backdrop-blur transition hover:bg-bg";
export const card = "rounded-3xl border border-border bg-bg p-6 shadow-[0_18px_40px_-30px_rgb(0_0_0/0.35)]";
/** Un écran entier sous la barre du haut (3 rem au téléphone, 2,75 rem sur ordinateur). */
export const screen = "min-h-[calc(100dvh-3rem-env(safe-area-inset-top))] md:min-h-[calc(100dvh-2.75rem-env(safe-area-inset-top))]";

export function SectionTitle({ index, title, children }: { index: string; title: string; children?: ReactNode }) {
  return (
    <div className="max-w-xl">
      <span aria-hidden="true" className="landing-index">
        {index}
      </span>
      <h2 className="landing-h2 mt-2">{title}</h2>
      {children ? <p className="mt-4 text-base leading-relaxed text-pretty text-fg-muted">{children}</p> : null}
    </div>
  );
}

export function DevShell({ children }: { children: ReactNode }) {
  return (
    <div className="landing fixed inset-0 overflow-x-hidden overflow-y-auto overscroll-contain bg-bg text-fg">
      <div aria-hidden="true" className="fond-lagon fond-lagon--page" />
      <LandingNav />
      <main id="contenu" className="landing-content relative">
        {children}
      </main>
      <footer className="landing-content relative z-10 border-t border-border landing-soft">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] text-xs text-fg-muted sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <BrandLogo size="sm" />
            <span>© {new Date().getFullYear()} GROUPE BTM</span>
          </div>
          <div className="flex gap-5">
            <Link href="/aide" className="zone-appui relative transition hover:text-fg">
              Aide
            </Link>
            <Link href="/confidentialite" className="zone-appui relative transition hover:text-fg">
              Données et confidentialité
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

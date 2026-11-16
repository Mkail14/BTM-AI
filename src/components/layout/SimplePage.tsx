import type { ReactNode } from "react";
import { BackHomeLinks } from "./BackHomeLink";

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
      {/* Même barre en verre dépoli que l'accueil et les pages Développeurs : le site garde un seul visage au téléphone. */}
      <header className="sticky top-0 z-20 border-b border-black/[0.06] bg-[rgb(255_255_255/0.58)] pt-[env(safe-area-inset-top)] text-[#1d1d1f] backdrop-blur-2xl backdrop-saturate-[1.8] dark:border-white/[0.08] dark:bg-[rgb(58_58_60/0.62)] dark:text-[#e8e8ed]">
        <div className={`mx-auto flex h-12 ${width} items-center justify-between gap-3 px-4 md:h-11`}>
          {/* Compte : « Retour à la conversation » ; visiteur : « Retour à l'accueil ». */}
          <BackHomeLinks />
        </div>
      </header>
      {/* Ancres du sommaire : la section s'arrête sous la barre fixe, pas dessous. */}
      <main id="contenu" className={`mx-auto ${width} px-4 pt-8 pb-28 sm:pt-10 [&_[id]]:scroll-mt-16`}>
        {/* Espace en bas : le rond d'aide ne cache pas la fin du texte. */}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-6">{children}</div>
      </main>
    </div>
  );
}

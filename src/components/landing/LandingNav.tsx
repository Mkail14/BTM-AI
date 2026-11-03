"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useBackToClose } from "@/components/layout/useBackToClose";
import { IconClose, IconMenu } from "@/components/ui/icons";
import { ThemeToggle } from "@/components/ui/Theme";

/** Rubriques de la barre du haut (ordinateur : en ligne ; téléphone : menu ☰). */
const NAV_LINKS = [
  { href: "/#shimaore", label: "Tamilya" },
  { href: "/partenaires", label: "Nos partenaires" },
  { href: "/groupe-btm", label: "Groupe BTM" },
  { href: "/developpeurs", label: "Développeurs" },
] as const;

/** Ancre de la page (« #… ») en lien simple, sinon lien Next. */
function NavLink({ href, ...props }: { href: string; className: string; onClick?: () => void; children: ReactNode }) {
  return href.startsWith("#") ? <a href={href} {...props} /> : <Link href={href} {...props} />;
}

/**
 * Barre du haut de l'accueil, reprise sur les pages publiques (partenaires…).
 * Barre fine en verre dépoli clair (blanc translucide ; gris clair translucide en thème sombre) :
 * logo, rubriques et compte sur une seule ligne, espacés régulièrement,
 * petit texte qui s'affirme au survol.
 * `onHome` : sur l'accueil, le logo et « Essayer Tamilya » ramènent au champ du haut ;
 * ailleurs (sans `onHome`), ils mènent à l'accueil.
 */
export function LandingNav({ scrolled = false, onHome }: { scrolled?: boolean; onHome?: () => void }) {
  const { openAuthDialog } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  // Menu ☰ du téléphone : le bouton retour le ferme au lieu de quitter la page.
  const dismissMenu = useBackToClose(menuOpen, closeMenu, "(max-width: 767px)");

  // Échap le ferme aussi.
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && dismissMenu();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, dismissMenu]);

  // Sur l'accueil, « Tamilya » descend à sa section sans recharger la page.
  const linkHref = (href: string) => (onHome && href.startsWith("/#") ? href.slice(1) : href);
  const logo = <BrandLogo size="sm" className="text-[#1d1d1f]! dark:text-[#f5f5f7]!" />;
  const tryClass = "btn-rose btn-rose--lagon h-8 rounded-full px-3.5 font-medium whitespace-nowrap md:h-7";

  return (
    <header
      data-scrolled={scrolled || undefined}
      className="landing-nav sticky top-0 z-20 border-b border-black/[0.06] bg-[rgb(255_255_255/0.5)] pt-[env(safe-area-inset-top)] text-[#1d1d1f] backdrop-blur-2xl backdrop-saturate-[1.8] transition-colors data-[scrolled]:bg-[rgb(255_255_255/0.58)] dark:border-white/[0.08] dark:bg-[rgb(58_58_60/0.62)] dark:text-[#e8e8ed] dark:data-[scrolled]:bg-[rgb(58_58_60/0.72)]"
    >
      <div className="mx-auto flex h-12 max-w-[1024px] items-center justify-between gap-3 px-4 text-[13px] sm:px-6 md:h-11 md:text-xs">
        {onHome ? (
          <button type="button" onClick={onHome} aria-label="BTM AI — haut de la page" className="-mx-1 rounded px-1 opacity-90 transition hover:opacity-100">
            {logo}
          </button>
        ) : (
          <Link href="/" aria-label="BTM AI — accueil" className="-mx-1 rounded px-1 opacity-90 transition hover:opacity-100">
            {logo}
          </Link>
        )}
        <nav aria-label="Navigation" className="hidden flex-1 items-center justify-evenly md:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <NavLink key={href} href={linkHref(href)} className="px-2 py-1 tracking-[0.01em] opacity-80 transition hover:opacity-100">
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-3">
          {/* Thème à part des actions du compte, séparé par un filet ; au téléphone, il est dans le menu déroulant. */}
          <div className="hidden items-center gap-3 sm:flex">
            <ThemeToggle className="grid size-8 place-items-center rounded-full opacity-80 transition hover:bg-black/[0.05] hover:opacity-100 dark:hover:bg-white/[0.08]" />
            <span aria-hidden="true" className="h-4 w-px bg-black/15 dark:bg-white/15" />
          </div>
          <button
            type="button"
            onClick={() => openAuthDialog({ mode: "signin" })}
            className="hidden px-2 py-2 whitespace-nowrap opacity-80 transition hover:opacity-100 sm:block"
          >
            Se connecter
          </button>
          {/* Ramène au champ du haut pour écrire à Tamilya tout de suite (le compte se crée depuis « Se connecter »). */}
          {onHome ? (
            <button type="button" onClick={onHome} className={tryClass}>
              Essayer Tamilya
            </button>
          ) : (
            <Link href="/" className={tryClass}>
              Essayer Tamilya
            </Link>
          )}
          <button
            type="button"
            onClick={() => (menuOpen ? dismissMenu() : setMenuOpen(true))}
            aria-expanded={menuOpen}
            aria-controls="landing-menu"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            className="-mr-2 grid size-10 place-items-center opacity-80 transition hover:opacity-100 md:hidden"
          >
            {menuOpen ? <IconClose width={20} height={20} /> : <IconMenu width={20} height={20} />}
          </button>
        </div>
      </div>

      {/* Téléphone : les rubriques se déplient sous la barre, en grandes lignes faciles à toucher. */}
      {menuOpen ? (
        <nav id="landing-menu" aria-label="Navigation" className="border-t border-black/10 px-4 pb-4 md:hidden dark:border-white/10">
          <ul className="mx-auto max-w-[1024px]">
            {NAV_LINKS.map(({ href, label }) => (
              <li key={href} className="border-b border-black/10 dark:border-white/10">
                <NavLink href={linkHref(href)} onClick={() => setMenuOpen(false)} className="block py-3.5 text-[17px] font-medium">
                  {label}
                </NavLink>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => {
                  dismissMenu();
                  openAuthDialog({ mode: "signin" });
                }}
                className="block w-full py-3.5 text-left text-[17px] font-medium opacity-80"
              >
                Se connecter
              </button>
            </li>
            <li className="border-t border-black/10 sm:hidden dark:border-white/10">
              <ThemeToggle withLabel className="flex w-full items-center gap-3 py-3.5 text-left text-[17px] font-medium opacity-80" />
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

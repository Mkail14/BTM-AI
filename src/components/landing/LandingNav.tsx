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
  // L'application n'a pas la section de présentation : ce lien n'y mènerait nulle part.
  { href: "/#shimaore", label: "Tamilya", hide: "app-hide" },
  { href: "/partenaires", label: "Nos partenaires", hide: "" },
  { href: "/developpeurs", label: "Développeurs", hide: "" },
  { href: "/mayotte", label: "Mayotte", hide: "" },
] as const;

/** Panneau qui s'ouvre au survol de « Tamilya » (ordinateur) ; sous-lignes du menu ☰ (téléphone). */
const TAMILYA_LINKS = [
  { href: "/tamilya-connect", label: "Tamilya Connect" },
  { href: "/tamilya-game", label: "Tamilya Game" },
] as const;

/** Sur le site, ces liens sont dans le pied de page ; l'application n'en a pas. */
const APP_LINKS = [
  { href: "/aide", label: "Aide" },
  { href: "/conditions", label: "Conditions" },
  { href: "/confidentialite", label: "Confidentialité" },
] as const;

/**
 * Accueil (« / », « /#… ») et ancres en lien simple : la page se charge en entier,
 * sans passer par l'écran de chargement de la conversation (sinon on voyait la
 * conversation 2 s avant l'accueil). Les autres pages restent en lien Next.
 */
const goesHome = (href: string) => href.startsWith("#") || href === "/" || href.startsWith("/#");

type NavLinkProps = {
  href: string;
  className: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  onFocus?: () => void;
  "aria-label"?: string;
  children: ReactNode;
};

function NavLink({ href, ...props }: NavLinkProps) {
  return goesHome(href) ? <a href={href} {...props} /> : <Link href={href} {...props} />;
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
  const { user, openAuthDialog } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  // Panneau Tamilya (ordinateur) : ouvert au survol ou au clavier, fermé en quittant la barre.
  const [subOpen, setSubOpen] = useState(false);
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

  useEffect(() => {
    if (!subOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setSubOpen(false);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [subOpen]);

  // Sur l'accueil, « Tamilya » descend à sa section sans recharger la page.
  const linkHref = (href: string) => (onHome && href.startsWith("/#") ? href.slice(1) : href);
  const logo = <BrandLogo size="sm" className="text-[#1d1d1f]! dark:text-[#f5f5f7]!" />;
  // Zone d'appui de 40 px au téléphone : bordure transparente en haut et en bas, le rose (fond coupé au bord intérieur) reste de 32 px.
  const tryClass =
    "app-hide btn-rose btn-rose--lagon h-10 rounded-full border-y-4 border-transparent bg-clip-padding px-3.5 font-medium whitespace-nowrap md:h-7 md:border-y-0";

  return (
    <>
    <header
      data-scrolled={scrolled || undefined}
      data-sub={subOpen || undefined}
      onMouseLeave={() => setSubOpen(false)}
      onBlur={(event) => !event.currentTarget.contains(event.relatedTarget) && setSubOpen(false)}
      className="landing-nav sticky top-0 z-30 border-b border-black/[0.06] bg-[rgb(255_255_255/0.5)] pt-[env(safe-area-inset-top)] text-[#1d1d1f] backdrop-blur-2xl backdrop-saturate-[1.8] transition-colors duration-300 data-[scrolled]:bg-[rgb(255_255_255/0.58)] data-[sub]:border-transparent data-[sub]:bg-[#fafafc]! dark:border-white/[0.08] dark:bg-[rgb(58_58_60/0.62)] dark:text-[#e8e8ed] dark:data-[scrolled]:bg-[rgb(58_58_60/0.72)] dark:data-[sub]:bg-[#1d1d1f]!"
    >
      <div className="mx-auto flex h-12 max-w-[1024px] items-center justify-between gap-3 px-4 text-[13px] sm:px-6 md:h-11 md:text-xs">
        {onHome ? (
          <button type="button" onClick={onHome} aria-label="BTM AI — haut de la page" className="zone-appui relative -mx-1 rounded px-1 opacity-90 transition hover:opacity-100">
            {logo}
          </button>
        ) : (
          <NavLink href="/" aria-label="BTM AI — accueil" className="zone-appui relative -mx-1 rounded px-1 opacity-90 transition hover:opacity-100">
            {logo}
          </NavLink>
        )}
        <nav aria-label="Navigation" className="hidden flex-1 items-center justify-evenly md:flex">
          {NAV_LINKS.map(({ href, label, hide }) => {
            const isTamilya = label === "Tamilya";
            // Survoler une autre rubrique referme le panneau Tamilya.
            const openSub = () => setSubOpen(isTamilya);
            return (
              <NavLink
                key={href}
                href={linkHref(href)}
                onMouseEnter={openSub}
                onFocus={openSub}
                className={`${hide} px-2 py-1 tracking-[0.01em] transition pointer-coarse:py-3 hover:opacity-100 ${isTamilya && subOpen ? "opacity-100" : "opacity-80"}`}
              >
                {label}
              </NavLink>
            );
          })}
          {/*
           * Panneau Tamilya, façon Apple : il prolonge la barre (même fond plein, sans filet entre les deux),
           * se déplie vers le bas, et ses liens apparaissent l'un après l'autre.
           */}
          <div
            data-open={subOpen || undefined}
            className="group/sub app-hide invisible absolute inset-x-0 top-full grid grid-rows-[0fr] bg-[#fafafc] transition-[grid-template-rows,visibility] duration-300 ease-[cubic-bezier(0.4,0,0.6,1)] data-[open]:visible data-[open]:grid-rows-[1fr] dark:bg-[#1d1d1f]"
          >
            <div className="overflow-hidden">
              <div className="mx-auto max-w-[1024px] px-6 pt-6 pb-8">
                <p className="text-xs text-[#6e6e73] opacity-0 transition-opacity duration-300 group-data-[open]/sub:opacity-100 group-data-[open]/sub:delay-100 dark:text-[#86868b]">
                  Découvrir Tamilya
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {TAMILYA_LINKS.map(({ href, label }, index) => (
                    <li
                      key={href}
                      style={{ transitionDelay: subOpen ? `${120 + index * 40}ms` : "0ms" }}
                      className="-translate-y-1 opacity-0 transition-[opacity,translate] duration-300 group-data-[open]/sub:translate-y-0 group-data-[open]/sub:opacity-100"
                    >
                      <NavLink
                        href={href}
                        onClick={() => setSubOpen(false)}
                        className="text-2xl leading-tight font-semibold tracking-[-0.015em] text-[#1d1d1f] transition-colors hover:text-[var(--accent)] dark:text-[#f5f5f7]"
                      >
                        {label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          {APP_LINKS.map(({ href, label }) => (
            <NavLink key={href} href={href} data-app-link="" className="app-only px-2 py-1 tracking-[0.01em] opacity-80 transition pointer-coarse:py-3 hover:opacity-100">
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-1 sm:gap-3">
          {/* Thème à part des actions du compte, séparé par un filet ; au téléphone, il est dans le menu déroulant. */}
          <div className="hidden items-center gap-3 sm:flex">
            <ThemeToggle className="grid size-8 place-items-center rounded-full opacity-80 pointer-coarse:size-10 transition hover:bg-black/[0.05] hover:opacity-100 dark:hover:bg-white/[0.08]" />
            <span aria-hidden="true" className="h-4 w-px bg-black/15 dark:bg-white/15" />
          </div>
          <button
            type="button"
            onClick={() => openAuthDialog({ mode: "signin" })}
            className={user ? "hidden" : "hidden px-2 py-2 whitespace-nowrap opacity-80 transition pointer-coarse:py-3 hover:opacity-100 sm:block"}
          >
            Se connecter
          </button>
          {/* Ramène au champ du haut pour écrire à Tamilya tout de suite (le compte se crée depuis « Se connecter »). */}
          {onHome ? (
            <button type="button" onClick={onHome} className={tryClass}>
              Essayer Tamilya
            </button>
          ) : (
            <NavLink href="/" className={tryClass}>
              Essayer Tamilya
            </NavLink>
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
            {NAV_LINKS.map(({ href, label, hide }) => (
              <li key={href} className={`${hide} border-b border-black/10 dark:border-white/10`}>
                <NavLink href={linkHref(href)} onClick={() => setMenuOpen(false)} className="block py-3.5 text-[17px] font-medium">
                  {label}
                </NavLink>
                {label === "Tamilya" ? (
                  <ul className="-mt-1 pb-2 pl-4">
                    {TAMILYA_LINKS.map((sub) => (
                      <li key={sub.href}>
                        <NavLink href={sub.href} onClick={() => setMenuOpen(false)} className="block py-2.5 text-[15px] opacity-80">
                          {sub.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
            {APP_LINKS.map(({ href, label }) => (
              <li key={href} className="app-only border-b border-black/10 dark:border-white/10">
                <NavLink href={href} data-app-link="" onClick={() => setMenuOpen(false)} className="block py-3.5 text-[17px] font-medium">
                  {label}
                </NavLink>
              </li>
            ))}
            <li hidden={Boolean(user)}>
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
    {/* Panneau Tamilya ouvert : la page derrière se floute et s'assombrit un peu (hors de la barre : son flou capturerait le fixed). */}
    <div
      aria-hidden="true"
      data-open={subOpen || undefined}
      className="app-hide pointer-events-none fixed inset-0 z-20 hidden bg-black/0 backdrop-blur-none transition-[background-color,backdrop-filter] duration-300 data-[open]:bg-black/20 data-[open]:backdrop-blur-md md:block"
    />
    </>
  );
}

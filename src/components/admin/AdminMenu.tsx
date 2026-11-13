"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useBackToClose } from "@/components/layout/useBackToClose";
import {
  IconBook,
  IconChip,
  IconClose,
  IconDashboard,
  IconDatabase,
  IconGauge,
  IconLanguage,
  IconMegaphone,
  IconMenu,
  IconSettings,
  IconShield,
  IconSparkle,
  IconSpeaker,
  IconUsers,
} from "@/components/ui/icons";

type MenuItem = {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: string;
  /** Libellé court de l'onglet, dans la barre du haut (sinon le libellé). */
  tab?: string;
};

/*
 * Rubriques de l'administration, groupées par sujet. Pour en ajouter une,
 * ajoutez une ligne ici. Les groupes titrés deviennent les onglets de la barre
 * du haut ; leurs pages, la ligne d'onglets du dessous.
 */
const SECTIONS: { title: string | null; items: MenuItem[] }[] = [
  {
    title: null,
    items: [{ label: "Tableau de bord", icon: IconDashboard, href: "/admin" }],
  },
  {
    title: "Tamilya",
    items: [
      { label: "Caractère et règles", tab: "Caractère", icon: IconSettings, href: "/admin/caractere" },
      { label: "Voix de Tamilya", tab: "Voix", icon: IconSpeaker, href: "/admin/voix" },
      { label: "Sons des histoires", tab: "Sons", icon: IconSpeaker, href: "/admin/sons" },
      { label: "Mémoire", icon: IconDatabase, href: "/admin/memoire" },
      { label: "Circuit de Tamilya", tab: "Circuit", icon: IconChip, href: "/admin/circuit" },
    ],
  },
  {
    title: "Savoir",
    items: [
      { label: "Connaissances", icon: IconBook, href: "/admin/connaissances" },
      { label: "Bibliothèque Mayotte", tab: "Bibliothèque", icon: IconBook, href: "/admin/bibliotheque" },
    ],
  },
  {
    title: "Shimaoré",
    items: [
      { label: "Lexique shimaoré", tab: "Lexique", icon: IconLanguage, href: "/admin/lexique" },
      { label: "Apprentissage du shimaoré", tab: "Apprentissage", icon: IconGauge, href: "/admin/apprentissage" },
    ],
  },
  {
    title: "Plateforme",
    items: [
      { label: "Utilisateurs", icon: IconUsers, href: "/admin/utilisateurs" },
      { label: "Bandeau d'accueil", tab: "Bandeau", icon: IconMegaphone, href: "/admin/bandeau" },
      { label: "Fonctionnalités", icon: IconSparkle, href: "/admin/fonctionnalites" },
    ],
  },
];

/** Réservé à l'administrateur principal. */
const PRINCIPAL_SECTION = {
  title: "Entreprise",
  items: [
    {
      label: "Profil de l'entreprise",
      tab: "Profil",
      icon: IconShield,
      href: "/admin/profil",
    },
  ],
};

const isActive = (pathname: string, href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

const tabClass = (active: boolean) =>
  `relative px-2.5 text-sm whitespace-nowrap transition-colors ${
    active
      ? "font-medium text-fg after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent"
      : "text-fg-muted hover:text-fg"
  }`;

/** Groupe de la page ouverte (aucun sur le tableau de bord ni sur le Profil). */
function activeGroup(pathname: string) {
  return SECTIONS.find((s) => s.title && s.items.some((item) => isActive(pathname, item.href))) ?? null;
}

/**
 * Onglets des groupes, dans la barre du haut sur grand écran : Tableau de bord
 * puis un onglet par groupe, qui mène à sa première page. Le Profil de
 * l'entreprise n'y figure pas : il s'ouvre depuis le menu du compte.
 */
export function AdminGroupTabs() {
  const pathname = usePathname();
  const current = activeGroup(pathname);
  return (
    <nav aria-label="Rubriques" className="flex h-14 items-stretch gap-1">
      {SECTIONS.map((section) => {
        const href = section.items[0].href;
        const active = section.title ? section === current : pathname === href;
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex items-center ${tabClass(active)}`}>
            {section.title ?? section.items[0].label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Pages du groupe ouvert, sous la barre du haut sur grand écran (rien hors d'un groupe). */
export function AdminTabs() {
  const pathname = usePathname();
  const current = activeGroup(pathname);
  if (!current) return null;
  return (
    <nav
      aria-label={current.title ?? undefined}
      className="scrollbar-none -mb-px flex items-center gap-1 overflow-x-auto border-t border-border"
    >
      {current.items.map(({ label, tab, href }) => {
        const active = isActive(pathname, href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`py-2.5 ${tabClass(active)}`}>
            {tab ?? label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Bouton ☰ qui ouvre le menu latéral de l'administration (petits écrans). */
export function AdminMenu({ principal = false }: { principal?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Bouton « retour » du téléphone : ferme le menu au lieu de quitter la page.
  const close = useCallback(() => setOpen(false), []);
  const dismiss = useBackToClose(open, close);

  // Échap pour fermer, focus dans le panneau à l'ouverture puis rendu au bouton.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const trigger = triggerRef.current;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open, dismiss]);

  // Lignes de 44 px au doigt sur téléphone.
  const itemClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu d'administration"
        aria-expanded={open}
        className="-ml-1.5 grid size-10 place-items-center rounded-lg text-fg-muted hover:bg-bg-muted hover:text-fg lg:hidden"
      >
        <IconMenu />
      </button>

      {/* Rendu dans <body> : le flou de la barre du haut enfermerait le panneau dans ses 56 px. */}
      {open
        ? createPortal(
            <>
              <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={dismiss} aria-hidden="true" />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Menu d'administration"
                className="scrollbar-none fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-bg-subtle shadow-xl"
              >
                <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
                  <span className="flex items-center gap-2">
                    <BrandLogo size="sm" />
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">Admin</span>
                  </span>
                  <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Fermer le menu"
                    className="zone-appui relative grid size-10 place-items-center rounded-lg text-fg-muted hover:bg-bg-muted hover:text-fg"
                  >
                    <IconClose />
                  </button>
                </div>

                <nav aria-label="Administration" className="flex-1 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  {(principal ? [...SECTIONS, PRINCIPAL_SECTION] : SECTIONS).map((section, i) => (
                    <div key={section.title ?? i} className="mt-4">
                      {section.title ? (
                        <h2 className="px-3 pb-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase">{section.title}</h2>
                      ) : null}
                      <ul className="space-y-0.5">
                        {section.items.map(({ label, icon: Icon, href }) => {
                          const active = isActive(pathname, href);
                          return (
                            <li key={label}>
                              <Link
                                href={href}
                                onClick={close}
                                aria-current={active ? "page" : undefined}
                                className={`${itemClass} ${active ? "bg-bg-muted font-medium" : "hover:bg-bg-muted"}`}
                              >
                                <Icon width={17} height={17} />
                                {label}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </nav>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

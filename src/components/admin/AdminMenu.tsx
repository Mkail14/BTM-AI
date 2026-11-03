"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  IconBook,
  IconChip,
  IconClose,
  IconDashboard,
  IconDatabase,
  IconDocument,
  IconLanguage,
  IconMail,
  IconMenu,
  IconSettings,
  IconShield,
  IconSparkle,
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
 * ajoutez une ligne ici.
 */
const SECTIONS: { title: string | null; items: MenuItem[] }[] = [
  {
    title: null,
    items: [{ label: "Tableau de bord", icon: IconDashboard, href: "/admin" }],
  },
  {
    title: "Personnalité",
    items: [
      {
        label: "Personnalités",
        icon: IconSparkle,
        href: "/admin/personnalites",
      },
      {
        label: "Caractère et règles",
        tab: "Caractère",
        icon: IconSettings,
        href: "/admin/caractere",
      },
    ],
  },
  {
    title: "Savoir",
    items: [
      { label: "Connaissances", icon: IconBook, href: "/admin/connaissances" },
      { label: "Lexique shimaoré", tab: "Lexique", icon: IconLanguage, href: "/admin/lexique" },
      { label: "Mémoire", icon: IconDatabase, href: "/admin/memoire" },
    ],
  },
  {
    title: "Plateforme",
    items: [
      { label: "Utilisateurs", icon: IconUsers, href: "/admin/utilisateurs" },
      { label: "Code de la route", tab: "Code", icon: IconDocument, href: "/admin/code" },
      { label: "Circuit de Tamilya", tab: "Circuit", icon: IconChip, href: "/admin/circuit" },
      { label: "E-mails", icon: IconMail, href: "/admin/emails" },
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

/**
 * Onglets de la barre du haut, sur grand écran : les mêmes rubriques que le
 * menu ☰, groupes séparés par un trait, la rubrique ouverte soulignée. Le
 * Profil de l'entreprise n'y figure pas : il s'ouvre depuis le menu du compte.
 */
export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Rubriques" className="scrollbar-none -mb-px flex items-center gap-1 overflow-x-auto">
      {SECTIONS.map((section, i) => (
        <div key={section.title ?? i} className="flex items-center gap-1">
          {i > 0 ? <span aria-hidden="true" className="mx-1.5 h-4 w-px bg-border" /> : null}
          {section.items.map(({ label, tab, href }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative px-2.5 py-3 text-sm whitespace-nowrap transition-colors ${
                  active
                    ? "font-medium text-fg after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.5 after:rounded-full after:bg-accent"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {tab ?? label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Bouton ☰ qui ouvre le menu latéral de l'administration (petits écrans). */
export function AdminMenu({ principal = false }: { principal?: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Échap pour fermer, focus dans le panneau à l'ouverture puis rendu au bouton.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("a, button")?.focus();
    const trigger = triggerRef.current;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  const itemClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu d'administration"
        aria-expanded={open}
        className="-ml-1 rounded-lg p-2 text-fg-muted hover:bg-bg-muted hover:text-fg lg:hidden"
      >
        <IconMenu />
      </button>

      {/* Rendu dans <body> : le flou de la barre du haut enfermerait le panneau dans ses 56 px. */}
      {open
        ? createPortal(
            <>
              <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setOpen(false)} aria-hidden="true" />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Menu d'administration"
                className="scrollbar-none fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-border bg-bg-subtle shadow-xl"
              >
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <span className="flex items-center gap-2">
                    <BrandLogo size="sm" />
                    <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">Admin</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    aria-label="Fermer le menu"
                    className="rounded-lg p-2 text-fg-muted hover:bg-bg-muted hover:text-fg"
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
                                onClick={() => setOpen(false)}
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

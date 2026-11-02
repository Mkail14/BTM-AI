"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import {
  IconBook,
  IconChip,
  IconClose,
  IconDashboard,
  IconDatabase,
  IconLanguage,
  IconMail,
  IconMenu,
  IconSettings,
  IconSparkle,
  IconUsers,
} from "@/components/ui/icons";

type MenuItem = {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  href: string;
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
      { label: "Personnalités", icon: IconSparkle, href: "/admin/personnalites" },
      { label: "Caractère et règles", icon: IconSettings, href: "/admin/caractere" },
    ],
  },
  {
    title: "Savoir",
    items: [
      { label: "Connaissances", icon: IconBook, href: "/admin/connaissances" },
      { label: "Lexique shimaoré", icon: IconLanguage, href: "/admin/lexique" },
      { label: "Mémoire", icon: IconDatabase, href: "/admin/memoire" },
    ],
  },
  {
    title: "Plateforme",
    items: [
      { label: "Utilisateurs", icon: IconUsers, href: "/admin/utilisateurs" },
      { label: "Circuit d'Awa", icon: IconChip, href: "/admin/circuit" },
      { label: "E-mails", icon: IconMail, href: "/admin/emails" },
    ],
  },
];

/** Bouton ☰ qui ouvre le menu latéral de l'administration. */
export function AdminMenu() {
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
        className="-ml-1 rounded-lg p-2 text-fg-muted hover:bg-bg-muted hover:text-fg"
      >
        <IconMenu />
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
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
              {SECTIONS.map((section, i) => (
                <div key={section.title ?? i} className="mt-4">
                  {section.title ? (
                    <h2 className="px-3 pb-1.5 text-xs font-medium tracking-wide text-fg-muted uppercase">{section.title}</h2>
                  ) : null}
                  <ul className="space-y-0.5">
                    {section.items.map(({ label, icon: Icon, href }) => {
                      const active = pathname === href;
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
        </>
      ) : null}
    </>
  );
}

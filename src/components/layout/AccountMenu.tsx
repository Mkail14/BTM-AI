"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AuthUser } from "@/components/auth/AuthProvider";
import { IconChevronUpDown, IconLock, IconLogout, IconSettings, IconShield } from "@/components/ui/icons";

/**
 * Bloc compte en bas de la barre latérale : avatar + nom sur une ligne,
 * menu (Paramètres, confidentialité, déconnexion) qui s'ouvre au-dessus.
 */
export function AccountMenu({
  user,
  onNavigate,
  onSignOut,
}: {
  user: AuthUser;
  onNavigate: () => void;
  onSignOut: () => void;
}) {
  // Position du menu (au-dessus du bouton), mesurée à l'ouverture.
  const [anchor, setAnchor] = useState<{ left: number; width: number; bottom: number } | null>(null);
  const open = anchor !== null;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const name = user.displayName || user.email || "Mon compte";
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  const setOpen = (value: boolean) => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setAnchor(value && rect ? { left: rect.left, width: rect.width, bottom: window.innerHeight - rect.top + 8 } : null);
  };

  // Fermeture : clic sur la page floutée, Échap (le focus revient sur le bouton)
  // ou redimensionnement (la position mesurée ne serait plus juste).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setAnchor(null);
        triggerRef.current?.focus();
      }
    }
    const onResize = () => setAnchor(null);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    onNavigate();
  };

  const itemClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-bg-muted";

  return (
    <div className="relative">
      {/*
       * Rendu dans <body> : la barre latérale est décalée (translate), ce qui
       * enfermerait un fond « fixed » dans sa largeur au lieu de couvrir la page.
       */}
      {anchor
        ? createPortal(
            <>
              {/* Page floutée derrière le menu ; un clic dessus le ferme. */}
              <div
                aria-hidden="true"
                onClick={() => setAnchor(null)}
                className="fixed inset-0 z-[60] bg-black/25 backdrop-blur-sm"
              />
              <div
                ref={menuRef}
                id={menuId}
                role="menu"
                aria-label="Mon compte"
                style={{ left: anchor.left, width: anchor.width, bottom: anchor.bottom }}
                className="fixed z-[61] rounded-xl border border-border bg-bg p-1.5 shadow-xl"
              >
          {user.email && user.displayName ? (
            <p className="truncate px-3 pt-1.5 pb-2 text-xs text-fg-muted" title={user.email}>
              {user.email}
            </p>
          ) : null}
          <Link href="/parametres" role="menuitem" onClick={close} className={itemClass}>
            <IconSettings /> Paramètres
          </Link>
          <Link href="/confidentialite" role="menuitem" onClick={close} className={itemClass}>
            <IconShield /> Données et confidentialité
          </Link>
          {user.isAdmin ? (
            <Link href="/admin" role="menuitem" onClick={close} className={itemClass}>
              <IconLock /> Administration
            </Link>
          ) : null}
          <div className="my-1 border-t border-border" role="separator" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className={itemClass}
          >
            <IconLogout /> Se déconnecter
          </button>
              </div>
            </>,
            document.body,
          )
        : null}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-bg-muted ${open ? "bg-bg-muted" : ""}`}
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg"
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium" title={user.email ?? undefined}>
          {name}
        </span>
        <IconChevronUpDown width={16} height={16} className="shrink-0 text-fg-muted" />
      </button>
    </div>
  );
}

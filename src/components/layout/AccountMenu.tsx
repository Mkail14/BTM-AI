"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const name = user.displayName || user.email || "Mon compte";
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  // Fermeture : clic à l'extérieur ou Échap (le focus revient sur le bouton).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    rootRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    onNavigate();
  };

  const itemClass = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-bg-muted";

  return (
    <div ref={rootRef} className="relative">
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Mon compte"
          className="absolute inset-x-0 bottom-full z-50 mb-2 rounded-xl border border-border bg-bg p-1.5 shadow-lg"
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
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
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

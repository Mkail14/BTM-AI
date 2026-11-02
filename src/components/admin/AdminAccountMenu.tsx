"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/components/auth/AuthProvider";
import { IconChevronUpDown, IconLogout, IconSettings, IconShield } from "@/components/ui/icons";

/**
 * Bouton du compte, à droite de la barre d'administration : avatar (initiale
 * de l'e-mail) qui ouvre un menu avec le rôle, le Profil de l'entreprise
 * (administrateur principal), le compte et la déconnexion. Ouvert, le reste de
 * l'écran est flouté : le menu est rendu dans <body> (la barre floutée, qui le
 * contient, enfermerait sinon le voile dans sa hauteur).
 */
export function AdminAccountMenu({ email, principal }: { email: string | null; principal: boolean }) {
  const { signOut } = useAuth();
  // Position du menu, sous le bouton (null : fermé).
  const [place, setPlace] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const open = place !== null;
  const close = () => setPlace(null);
  const toggle = () => {
    const rect = button.current?.getBoundingClientRect();
    setPlace(open || !rect ? null : { top: rect.bottom + 8, right: window.innerWidth - rect.right });
  };

  // Fermé par Échap ou en redimensionnant la fenêtre (le menu ne suivrait plus le bouton), puis focus rendu au bouton.
  useEffect(() => {
    if (!open) return;
    const trigger = button.current;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPlace(null);
    const onResize = () => setPlace(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      trigger?.focus();
    };
  }, [open]);

  const initial = (email?.[0] ?? "?").toUpperCase();
  const role = principal ? "Administrateur principal" : "Administrateur secondaire";
  const item = "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-bg-muted";

  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Compte : ${email ?? role}`}
        className="flex items-center gap-2 rounded-full py-1 pr-1 pl-1 hover:bg-bg-muted md:pr-2"
      >
        <span className="grid size-8 place-items-center rounded-full bg-gradient-to-br from-accent to-accent-hover text-sm font-semibold text-accent-fg">
          {initial}
        </span>
        <span className="hidden max-w-36 truncate text-sm font-medium lg:block">{email}</span>
        <IconChevronUpDown width={14} height={14} className="hidden text-fg-muted md:block" />
      </button>

      {place
        ? createPortal(
            <>
              {/* Voile : floute tout l'écran, un clic dessus ferme le menu. */}
              <div aria-hidden="true" onClick={close} className="fixed inset-0 z-[60] bg-black/25 backdrop-blur-sm" />
              <div
                role="menu"
                style={{ top: place.top, right: place.right }}
                className="booking-pop fixed z-[61] w-64 origin-top-right rounded-xl border border-border bg-bg p-1.5 shadow-2xl"
              >
                <div className="px-3 py-2">
                  <p className="truncate text-sm font-medium">{email}</p>
                  <p className="mt-0.5 text-xs text-fg-muted">{role}</p>
                </div>
                <hr className="my-1 border-border" />
                {principal ? (
                  <Link href="/admin/profil" role="menuitem" onClick={close} className={item}>
                    <IconShield width={16} height={16} /> Profil de l&apos;entreprise
                  </Link>
                ) : null}
                <Link href="/parametres" role="menuitem" onClick={close} className={item}>
                  <IconSettings width={16} height={16} /> Mon compte
                </Link>
                <hr className="my-1 border-border" />
                <button type="button" role="menuitem" onClick={signOut} className={`${item} text-danger`}>
                  <IconLogout width={16} height={16} /> Se déconnecter
                </button>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

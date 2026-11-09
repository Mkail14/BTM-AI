"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AuthUser } from "@/components/auth/AuthProvider";
import { IconChevronUpDown, IconGauge, IconHelp, IconLogout, IconSettings, IconWallet } from "@/components/ui/icons";
import { formatEuros } from "@/lib/wallet/limits";

/** Solde du portefeuille (demo : solde fictif de la démonstration), relu à chaque changement de page et au retour sur l'onglet. */
function useBalance(enabled: boolean): { cents: number; demo: boolean } | null {
  const pathname = usePathname();
  const [balance, setBalance] = useState<{ cents: number; demo: boolean } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const load = () =>
      fetch("/api/wallet", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data: { balanceCents?: number; demo?: boolean } | null) => {
          if (alive && typeof data?.balanceCents === "number") setBalance({ cents: data.balanceCents, demo: Boolean(data.demo) });
        })
        .catch(() => {});
    load();
    window.addEventListener("focus", load);
    return () => {
      alive = false;
      window.removeEventListener("focus", load);
    };
  }, [pathname, enabled]);
  return balance;
}

/**
 * Bloc compte en bas de la barre latérale : avatar + nom sur une ligne,
 * menu (Paramètres, confidentialité, déconnexion) qui s'ouvre au-dessus.
 */
export function AccountMenu({
  user,
  onNavigate,
  onSignOut,
  compact = false,
}: {
  user: AuthUser;
  onNavigate: () => void;
  onSignOut: () => void;
  /** Barre latérale repliée (ordinateur) : la pastille seule. */
  compact?: boolean;
}) {
  // Position du menu (au-dessus du bouton), mesurée à l'ouverture.
  const [anchor, setAnchor] = useState<{ left: number; width: number; bottom: number } | null>(null);
  const open = anchor !== null;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  // Portefeuille réservé aux admins tant qu'aucun partenariat n'est signé (le serveur refuse aussi).
  const walletOn = Boolean(user.isAdmin);
  const balance = useBalance(walletOn);

  const name = user.displayName || user.email || "Mon compte";
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  const setOpen = (value: boolean) => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setAnchor(value && rect ? { left: rect.left, width: Math.max(rect.width, 256), bottom: window.innerHeight - rect.top + 8 } : null);
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
    // Largeur seulement : sur téléphone, la barre d'adresse qui se replie change la hauteur
    // (événement resize) et fermait le menu sous le doigt.
    const width = window.innerWidth;
    const onResize = () => {
      if (window.innerWidth !== width) setAnchor(null);
    };
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
          {/* Portefeuille et administration sont déjà à l'extérieur (solde, Tableau de bord) :
              le portefeuille ne revient ici que si la barre repliée cache le solde. */}
          {compact && walletOn ? (
            <Link href="/portefeuille" role="menuitem" onClick={close} className={`${itemClass} max-md:hidden`}>
              <IconWallet /> Portefeuille
              {balance !== null ? (
                <span className="ml-auto text-xs font-semibold text-fg-muted tabular-nums">
                  {formatEuros(balance.cents)}
                  {balance.demo ? " (démo)" : ""}
                </span>
              ) : null}
            </Link>
          ) : null}
          <Link href="/parametres" role="menuitem" onClick={close} className={itemClass}>
            <IconSettings /> Paramètres
          </Link>
          <Link href="/utilisation" role="menuitem" onClick={close} className={itemClass}>
            <IconGauge /> Utilisation
          </Link>
          <Link href="/aide" role="menuitem" onClick={close} className={itemClass}>
            <IconHelp /> Obtenir de l&apos;aide
          </Link>
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

      <div className="flex items-center gap-1">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={compact ? `Mon compte : ${name}` : undefined}
        title={compact ? name : undefined}
        className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-bg-muted ${compact ? "md:justify-center" : ""} ${open ? "bg-bg-muted" : ""}`}
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-fg"
        >
          {initial}
        </span>
        <span className={`min-w-0 flex-1 truncate font-medium ${compact ? "md:hidden" : ""}`} title={user.email ?? undefined}>
          {name}
        </span>
        <IconChevronUpDown width={16} height={16} className={`shrink-0 text-fg-muted ${compact ? "md:hidden" : ""}`} />
      </button>
      {/* Solde du portefeuille : un clic ouvre la page pour recharger ou voir l'historique. */}
      {walletOn ? (
      <Link
        href="/portefeuille"
        onClick={onNavigate}
        aria-label={balance !== null ? `Portefeuille : ${formatEuros(balance.cents)}${balance.demo ? " (solde fictif de démonstration)" : ""}` : "Portefeuille"}
        title={balance?.demo ? "Solde fictif de démonstration" : undefined}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-bg px-2.5 py-1.5 text-xs font-semibold tabular-nums transition hover:border-accent/40 hover:text-accent ${compact ? "md:hidden" : ""}`}
      >
        <IconWallet width={14} height={14} className="text-accent" />
        {balance !== null ? formatEuros(balance.cents) : "—"}
        {balance?.demo ? <span className="font-normal text-fg-muted">démo</span> : null}
      </Link>
      ) : null}
      </div>
    </div>
  );
}

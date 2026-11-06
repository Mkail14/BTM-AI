"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type TouchEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { alertDialog, confirmDialog } from "@/components/ui/ConfirmDialog";
import { IconClose, IconDashboard, IconLock, IconPlus, IconSettings, IconSidebar } from "@/components/ui/icons";
import { AccountMenu } from "./AccountMenu";
import { ConversationItem } from "./ConversationItem";
import { useChatShell } from "./ChatShell";
import { useBackToClose } from "./useBackToClose";

const COLLAPSED_KEY = "btm.sidebar.collapsed";
const COLLAPSED_EVENT = "btm:sidebar-collapsed";

/* Barre repliée ou non : lue dans le navigateur, gardée d'une visite à l'autre. */
function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

// Repliée par défaut : la page paraît plus ouverte. Dépliée seulement si on l'a choisi.
const readCollapsed = () => localStorage.getItem(COLLAPSED_KEY) !== "0";

function setStoredCollapsed(value: boolean) {
  localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, openAuthDialog, signOut } = useAuth();
  const { conversations, conversationsLoading, refreshConversations, startNewChat } = useChatShell();
  const pathname = usePathname();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Ordinateur : barre repliée en colonne d'icônes, choix gardé d'une visite à l'autre.
  // Le tiroir du téléphone, lui, est toujours déplié (classes md: seulement).
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => true);
  const toggleCollapsed = () => setStoredCollapsed(!collapsed);
  /** Masqué quand la barre est repliée (ordinateur). */
  const wide = collapsed ? "md:hidden" : "";
  /** Texte d'un bouton : seulement lu par les lecteurs d'écran quand la barre est repliée. */
  const label = collapsed ? "md:sr-only" : "";
  /** Bouton carré centré quand la barre est repliée. */
  const iconOnly = collapsed ? "md:justify-center md:px-0" : "";

  /** Fermeture voulue (croix, fond, Échap, glissement) : le bouton « retour » du téléphone ferme aussi le tiroir. */
  const dismiss = useBackToClose(open, onClose, "(max-width: 767px)");

  // Tiroir mobile : Échap pour fermer, focus déplacé dans le panneau.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") dismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dismiss]);

  // Tiroir mobile : glisser vers la gauche le referme.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    swipe.current = open && touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = swipe.current;
    const touch = event.changedTouches[0];
    swipe.current = null;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    if (dx < -60 && Math.abs(dx) > Math.abs(touch.clientY - start.y) * 1.5) dismiss();
  };

  async function handleDelete(id: string, title: string) {
    const ok = await confirmDialog({
      title: "Supprimer cette conversation ?",
      message: `« ${title} » sera effacée définitivement.`,
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 404) {
        refreshConversations();
        if (pathname === `/c/${id}`) router.push("/");
      } else {
        void alertDialog({ title: "La suppression a échoué", message: "Réessaie dans un instant." });
      }
    } catch {
      void alertDialog({ title: "La suppression a échoué", message: "Vérifie ta connexion." });
    } finally {
      setDeletingId(null);
    }
  }

  const requireAccount = (reason: string, next?: string) => {
    onClose();
    openAuthDialog({ reason, next });
  };

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden" onClick={dismiss} aria-hidden="true" />
      ) : null}
      <div
        ref={panelRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col overflow-x-hidden border-r border-border bg-bg-subtle transition-[width,translate] duration-200 ease-out md:static md:z-auto md:translate-x-0 ${
          collapsed ? "md:w-16" : "md:w-72"
        } ${open ? "visible translate-x-0" : "invisible -translate-x-full md:visible"}`}
        aria-label="Navigation"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
      >
        <div className={`flex items-center justify-between px-4 pt-4 pb-3 ${collapsed ? "md:justify-center md:px-0" : ""}`}>
          <Link href="/" onClick={onClose} aria-label="BTM AI — accueil" className={`rounded ${wide}`}>
            <BrandLogo size="md" />
          </Link>
          {/* Repliée : le « + » passe sous le bouton de repli. */}
          <div className={`flex items-center gap-1.5 ${collapsed ? "md:flex-col md:gap-3" : ""}`}>
            <button
              type="button"
              onClick={() => {
                // Déjà sur l'accueil : pas de changement de page, l'entrée du tiroir peut être retirée.
                if (pathname === "/") dismiss();
                startNewChat();
              }}
              aria-label="Nouvelle conversation"
              aria-keyshortcuts="Control+Shift+O Meta+Shift+O"
              title="Nouvelle conversation"
              className={`bouton-verre ${collapsed ? "md:order-last" : ""}`}
            >
              <IconPlus width={18} height={18} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="grid size-10 place-items-center rounded-lg text-fg-muted hover:bg-bg-muted md:hidden"
              aria-label="Fermer le menu"
            >
              <IconClose />
            </button>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? "Déplier la barre latérale" : "Replier la barre latérale"}
              aria-expanded={!collapsed}
              title={collapsed ? "Déplier" : "Replier"}
              className="hidden rounded-lg p-2 text-fg-muted transition hover:bg-bg-muted hover:text-fg md:block"
            >
              <IconSidebar width={20} height={20} />
            </button>
          </div>
        </div>

        <div className={`px-3 ${collapsed ? "md:px-2.5" : ""}`}>
          {user?.isAdmin ? (
            <Link
              href="/admin"
              onClick={onClose}
              title={collapsed ? "Tableau de bord" : undefined}
              className={`flex w-full items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium whitespace-nowrap text-accent-fg hover:bg-accent-hover ${iconOnly}`}
            >
              <IconDashboard className="shrink-0" />
              <span className={label}>Tableau de bord</span>
            </Link>
          ) : null}
        </div>

        {/* Repliée : pas d'historique, la colonne reste vide jusqu'au compte. */}
        {collapsed ? <div className="hidden flex-1 md:block" /> : null}
        <nav aria-label="Conversations récentes" className={`mt-5 min-h-0 flex-1 overflow-y-auto px-3 ${wide}`}>
          <h2 className="px-2 pb-2 text-xs font-medium tracking-wide text-fg-muted uppercase">Historique</h2>
          {user ? (
            conversations.length > 0 ? (
              <ul className="space-y-0.5">
                {conversations.map((conversation) => {
                  const active = pathname === `/c/${conversation.id}`;
                  return (
                    <ConversationItem
                      key={conversation.id}
                      id={conversation.id}
                      title={conversation.title}
                      connect={conversation.source === "connect"}
                      active={active}
                      deleting={deletingId === conversation.id}
                      onNavigate={onClose}
                      onDelete={() => handleDelete(conversation.id, conversation.title)}
                    />
                  );
                })}
              </ul>
            ) : (
              <p className="px-2 text-sm text-fg-muted">
                {conversationsLoading ? "Chargement…" : "Tes conversations enregistrées apparaîtront ici."}
              </p>
            )
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <IconLock width={16} height={16} />
                Historique réservé aux comptes
              </p>
              <p className="mt-1 text-fg-muted">
                Crée un compte gratuit pour enregistrer tes conversations et les retrouver sur tous tes appareils.
              </p>
              <button
                type="button"
                onClick={() =>
                  requireAccount("Crée un compte pour enregistrer tes conversations et retrouver ton historique.")
                }
                className="mt-3 text-sm font-medium text-accent hover:underline"
              >
                Créer un compte ou se connecter
              </button>
            </div>
          )}
        </nav>

        <div
          className={`border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm ${collapsed ? "md:px-2" : ""}`}
        >
          {user ? (
            <AccountMenu user={user} onNavigate={onClose} onSignOut={signOut} compact={collapsed} />
          ) : collapsed ? (
            <button
              type="button"
              onClick={() => openAuthDialog()}
              aria-label="Se connecter"
              title="Se connecter"
              className="hidden w-full place-items-center rounded-lg bg-accent py-2 text-accent-fg hover:bg-accent-hover md:grid"
            >
              <IconLock />
            </button>
          ) : null}
          {!user ? (
            <div className={wide}>
              <button
                type="button"
                onClick={() => requireAccount("Connecte-toi pour accéder à tes paramètres.", "/parametres")}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-bg-muted"
              >
                <IconSettings /> Paramètres
                <IconLock width={14} height={14} className="ml-auto text-fg-muted" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  openAuthDialog();
                }}
                className="mt-1 w-full rounded-lg bg-accent px-3 py-2 font-medium text-accent-fg hover:bg-accent-hover"
              >
                Se connecter
              </button>
              <Link href="/confidentialite" onClick={onClose} className="mt-2 block px-2 text-xs text-fg-muted hover:underline">
                Données et confidentialité
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

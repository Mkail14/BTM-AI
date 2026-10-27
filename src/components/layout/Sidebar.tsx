"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { IconClose, IconLock, IconPlus, IconSettings, IconTrash } from "@/components/ui/icons";
import { AccountMenu } from "./AccountMenu";
import { useChatShell } from "./ChatShell";

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, openAuthDialog, signOut } = useAuth();
  const { conversations, conversationsLoading, refreshConversations, startNewChat } = useChatShell();
  const pathname = usePathname();
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Tiroir mobile : Échap pour fermer, focus déplacé dans le panneau.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function handleDelete(id: string, title: string) {
    if (!window.confirm(`Supprimer définitivement la conversation « ${title} » ?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 404) {
        refreshConversations();
        if (pathname === `/c/${id}`) router.push("/");
      } else {
        window.alert("La suppression a échoué. Réessayez.");
      }
    } catch {
      window.alert("La suppression a échoué : vérifiez votre connexion.");
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
        <div className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden" onClick={onClose} aria-hidden="true" />
      ) : null}
      <div
        ref={panelRef}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-border bg-bg-subtle transition-transform md:static md:z-auto md:translate-x-0 ${
          open ? "visible translate-x-0" : "invisible -translate-x-full md:visible"
        }`}
        aria-label="Navigation"
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
      >
        <div className="flex items-center justify-between px-4 pt-4 pb-3">
          <Link href="/" onClick={onClose} aria-label="BTM AI — accueil" className="rounded">
            <BrandLogo size="md" />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-fg-muted hover:bg-bg-muted md:hidden"
            aria-label="Fermer le menu"
          >
            <IconClose />
          </button>
        </div>

        <div className="px-3">
          <button
            type="button"
            onClick={startNewChat}
            aria-keyshortcuts="Control+Shift+O Meta+Shift+O"
            className="flex w-full items-center gap-2 rounded-lg border border-border bg-bg px-3 py-2 text-sm font-medium hover:bg-bg-muted"
          >
            <IconPlus />
            Nouvelle conversation
          </button>
        </div>

        <nav aria-label="Conversations récentes" className="mt-5 min-h-0 flex-1 overflow-y-auto px-3">
          <h2 className="px-2 pb-2 text-xs font-medium tracking-wide text-fg-muted uppercase">Historique</h2>
          {user ? (
            conversations.length > 0 ? (
              <ul className="space-y-0.5">
                {conversations.map((conversation) => {
                  const active = pathname === `/c/${conversation.id}`;
                  return (
                    <li key={conversation.id} className="group relative">
                      <Link
                        href={`/c/${conversation.id}`}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={`block truncate rounded-lg py-2 pr-9 pl-2 text-sm ${
                          active ? "bg-bg-muted font-medium" : "hover:bg-bg-muted"
                        }`}
                      >
                        {conversation.title}
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDelete(conversation.id, conversation.title)}
                        disabled={deletingId === conversation.id}
                        aria-label={`Supprimer « ${conversation.title} »`}
                        // Souris : visible au survol. Tactile (téléphone, iPad) : toujours visible, sinon introuvable.
                        className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5 text-fg-muted opacity-100 hover:bg-bg hover:text-danger focus:opacity-100 pointer-coarse:p-2 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
                      >
                        <IconTrash width={15} height={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-2 text-sm text-fg-muted">
                {conversationsLoading ? "Chargement…" : "Vos conversations enregistrées apparaîtront ici."}
              </p>
            )
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <IconLock width={16} height={16} />
                Historique réservé aux comptes
              </p>
              <p className="mt-1 text-fg-muted">
                Créez un compte gratuit pour enregistrer vos conversations et les retrouver sur tous vos appareils.
              </p>
              <button
                type="button"
                onClick={() =>
                  requireAccount("Créez un compte pour enregistrer vos conversations et retrouver votre historique.")
                }
                className="mt-3 text-sm font-medium text-accent hover:underline"
              >
                Créer un compte ou se connecter
              </button>
            </div>
          )}
        </nav>

        <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-sm">
          {user ? (
            <AccountMenu user={user} onNavigate={onClose} onSignOut={signOut} />
          ) : (
            <>
              <button
                type="button"
                onClick={() => requireAccount("Connectez-vous pour accéder à vos paramètres.", "/parametres")}
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
            </>
          )}
        </div>
      </div>
    </>
  );
}

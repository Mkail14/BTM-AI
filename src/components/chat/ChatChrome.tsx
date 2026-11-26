import type { CSSProperties, ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { IconArrowLeft, IconMenu, IconMic } from "@/components/ui/icons";

/*
 * L'habillage de la page de conversation : fond, barre du haut, liste des messages,
 * zone du bas. Ces pièces servent à la vraie conversation (ChatShell, ChatView) et à
 * l'aperçu montré dans le téléphone de l'accueil (/apercu/conversation) : un
 * changement fait ici se voit aux deux endroits, sans rien recopier.
 */

/** Zone de conversation teintée par la personnalité de Tamilya : fond, courbes du lagon, filet en haut. */
export function ChatSurface({ persona, style, children }: { persona: string; style: CSSProperties; children: ReactNode }) {
  return (
    <main id="contenu" data-persona={persona} style={style} className="persona-surface relative flex min-w-0 flex-1 flex-col">
      <div aria-hidden="true" className="fond-lagon" />
      <div aria-hidden="true" className="persona-line pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5" />
      {children}
    </main>
  );
}

/** Barre du haut. `onBack` : flèche et logo qui ramènent à l'accueil (visiteur). */
export function ChatHeader({
  onBack,
  onMenu,
  children,
}: {
  onBack?: (() => void) | null;
  onMenu: () => void;
  /** À droite : la cloche des notifications. */
  children?: ReactNode;
}) {
  return (
    // z-20 : au-dessus des boutons des messages (copier, écouter : z-10) qui défilent dessous.
    <header className="sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 persona-backdrop border-b border-border px-3 pt-[env(safe-area-inset-top)] md:border-transparent md:px-5">
      {/* Visiteur : flèche pour revenir à la page d'accueil (la conversation est gardée). */}
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Revenir à l'accueil"
          title="Revenir à l'accueil"
          className="zone-appui relative rounded-lg p-2 text-fg-muted hover:bg-bg-muted hover:text-fg"
        >
          <IconArrowLeft />
        </button>
      ) : null}
      <button type="button" onClick={onMenu} className="zone-appui relative rounded-lg p-2 text-fg-muted hover:bg-bg-muted md:hidden" aria-label="Ouvrir le menu">
        <IconMenu />
      </button>
      {/* Visiteur : le logo ramène à la page d'accueil. */}
      {onBack ? (
        <button type="button" onClick={onBack} aria-label="Revenir à l'accueil" className="rounded md:hidden">
          <BrandLogo size="sm" />
        </button>
      ) : (
        <span className="md:hidden">
          <BrandLogo size="sm" />
        </span>
      )}
      <div className="ml-auto flex items-center gap-2">
        {/* Nouvelle conversation : seulement par le menu, pas de « + » ici (demande du 2026-11-25). */}
        {children}
      </div>
    </header>
  );
}

/** Colonne des messages. */
export function MessageThread({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Conversation" className="mx-auto w-full max-w-3xl space-y-10 px-3.5 pt-4 pb-10 sm:px-6 sm:pt-6 sm:pb-12">
      {children}
    </section>
  );
}

/**
 * Zone du bas, collée : la barre pour écrire et ce qui l'entoure. Hors accueil
 * (`empty` faux), un fondu vers la teinte de la conversation : les messages passent dessous en douceur.
 * Ce fondu cacherait les courbes du lagon : il les redessine, calées sur celles de la page (voir globals.css).
 */
export function ComposerDock({ empty, before, children }: { empty: boolean; /** Posé au-dessus de la zone (bouton « revenir en bas »). */ before?: ReactNode; children: ReactNode }) {
  return (
    <div
      className={`composer-dock sticky bottom-0 z-10 shrink-0 px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] ${
        empty ? "pt-1" : "pt-4"
      }`}
    >
      {empty ? null : (
        <div aria-hidden="true" className="composer-dock-fond">
          <div>
            <div className="fond-lagon" />
          </div>
        </div>
      )}
      {before}
      <div className="mx-auto w-full max-w-3xl space-y-2">{children}</div>
    </div>
  );
}

/** Ligne de la barre pour écrire : au repos, alignée sur les messages ; dès qu'on écrit, elle s'étire en douceur sur toute la largeur. */
export function ComposerRow({ children }: { children: ReactNode }) {
  return <div className="flex items-end gap-2 transition-[padding] duration-300 ease-out motion-reduce:transition-none sm:px-6 sm:focus-within:px-0">{children}</div>;
}

/** Micro, dans la barre pour écrire : ouvre le vocal. */
export function MicButton({ onClick, disabled = false }: { onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Parler à Tamilya"
      title="Parler à Tamilya"
      className="grid size-8 shrink-0 place-items-center rounded-full text-fg-muted transition hover:bg-bg-muted hover:text-fg disabled:opacity-45"
    >
      <IconMic />
    </button>
  );
}

/** Petite ligne sous la barre pour écrire. */
export function ChatFootnote({ children }: { children: ReactNode }) {
  return <p className="text-center text-[11px] text-fg-muted">{children}</p>;
}

export const CHAT_DISCLAIMER = "Tamilya peut se tromper. Vérifie les informations importantes.";
export const CHAT_PLACEHOLDER = "Demande-moi ce que tu veux…";

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { IconDots, IconTrash } from "@/components/ui/icons";
import { hapticWriting } from "@/lib/chat/haptics";

const LONG_PRESS_MS = 450;

/**
 * Une conversation de l'historique, à la manière de ChatGPT : aucune action
 * visible par défaut. Souris : « ⋯ » au survol. Tactile : appui long sur la
 * ligne (ou « ⋯ », affiché seulement sur la conversation ouverte). Le menu
 * propose la suppression.
 */
export function ConversationItem({
  id,
  title,
  connect = false,
  active,
  deleting,
  onNavigate,
  onDelete,
}: {
  id: string;
  title: string;
  /** Conversation née dans Tamilya Connect : petite marque après le titre. */
  connect?: boolean;
  active: boolean;
  deleting: boolean;
  onNavigate: () => void;
  onDelete: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const itemRef = useRef<HTMLLIElement>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Après un appui long, le relâchement ne doit pas ouvrir la conversation.
  const longPressed = useRef(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: PointerEvent) => {
      if (!itemRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  return (
    <li ref={itemRef} className="group relative">
      <Link
        href={`/c/${id}`}
        aria-current={active ? "page" : undefined}
        onClick={(event) => {
          if (longPressed.current) {
            event.preventDefault();
            longPressed.current = false;
            return;
          }
          onNavigate();
        }}
        onTouchStart={() => {
          longPressed.current = false;
          pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            hapticWriting();
            setMenuOpen(true);
          }, LONG_PRESS_MS);
        }}
        onTouchMove={cancelPress}
        onTouchEnd={cancelPress}
        onTouchCancel={cancelPress}
        // Pas de menu natif du navigateur (« Ouvrir dans un onglet »…) sur appui long.
        onContextMenu={(event) => {
          if (window.matchMedia("(pointer: coarse)").matches) event.preventDefault();
        }}
        className={`flex items-center gap-1.5 rounded-lg py-2 pr-9 pl-2 text-sm select-none [-webkit-touch-callout:none] ${
          active || menuOpen ? "bg-bg-muted font-medium" : "hover:bg-bg-muted"
        }`}
      >
        <span className="min-w-0 truncate">{title}</span>
        {connect ? <span className="sr-only"> (Tamilya Connect)</span> : null}
        {connect ? (
          <span aria-hidden="true" className="shrink-0 rounded-full border border-border px-1.5 py-px text-[10px] font-medium text-fg-muted">
            Connect
          </span>
        ) : null}
      </Link>

      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-label={`Actions pour « ${title} »`}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        className={`absolute top-1/2 right-1 grid -translate-y-1/2 place-items-center rounded-md p-1.5 text-fg-muted transition-opacity hover:bg-bg hover:text-fg focus-visible:opacity-100 ${
          active || menuOpen ? "opacity-100" : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100"
        }`}
      >
        <IconDots width={16} height={16} />
      </button>

      {menuOpen ? (
        <div
          role="menu"
          aria-label={`Actions pour « ${title} »`}
          className="absolute top-full right-1 z-30 mt-1 w-48 animate-[correct-fade_.12s_ease-out] rounded-xl border border-border bg-bg p-1 shadow-xl"
        >
          <button
            type="button"
            role="menuitem"
            autoFocus
            disabled={deleting}
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
          >
            <IconTrash width={16} height={16} />
            {deleting ? "Suppression…" : "Supprimer"}
          </button>
        </div>
      ) : null}
    </li>
  );
}

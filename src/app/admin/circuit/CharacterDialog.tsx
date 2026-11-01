"use client";

import { useCallback, useEffect, useRef } from "react";
import { IconClose, IconSettings } from "@/components/ui/icons";
import { CharacterForm } from "../caractere/CharacterForm";
import type { CharacterDraft } from "../caractere/limits";

/** Fenêtre de réglage du bloc « Caractère et règles ». */
export function CharacterDialog({
  saved,
  defaults,
  onClose,
}: {
  saved: CharacterDraft;
  defaults: CharacterDraft;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const dirtyRef = useRef(false);
  const onDirtyChange = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);

  const close = useCallback(() => {
    if (!dirtyRef.current || window.confirm("Fermer sans enregistrer les modifications ?")) onClose();
  }, [onClose]);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("textarea")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={close} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="character-title"
        className="fixed top-1/2 left-1/2 z-50 flex h-[calc(100dvh-2rem)] max-h-[52rem] w-[calc(100%-2rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-bg-subtle shadow-2xl"
      >
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-bg px-5 py-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <IconSettings width={20} height={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="character-title" className="text-lg leading-tight font-semibold">
              Caractère et règles
            </h2>
            <p className="mt-0.5 text-sm text-fg-muted">Envoyés au modèle à chaque message, quelle que soit la personnalité.</p>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Fermer"
            className="rounded-lg p-2 text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <IconClose />
          </button>
        </div>
        <CharacterForm saved={saved} defaults={defaults} onCancel={close} onSaved={onClose} onDirtyChange={onDirtyChange} />
      </div>
    </>
  );
}

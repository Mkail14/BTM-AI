"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { IconHelp, IconOffline, IconTrash } from "./icons";

/**
 * Remplace window.confirm et window.alert par une fenêtre animée aux
 * couleurs du site : `if (!(await confirmDialog({ … }))) return;`.
 * Une seule fenêtre à la fois, affichée par <DialogHost /> (layout racine).
 * Téléphone : feuille qui monte du bas ; ordinateur : fenêtre centrée.
 */

type Tone = "default" | "danger";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** « danger » : bouton rouge et icône corbeille (suppression, retrait…). */
  tone?: Tone;
};

type Request = ConfirmOptions & { kind: "confirm" | "alert"; resolve: (ok: boolean) => void };

let current: Request | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function open(request: Request) {
  current?.resolve(false);
  current = request;
  emit();
}

export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => open({ ...options, kind: "confirm", resolve }));
}

export function alertDialog(options: Omit<ConfirmOptions, "cancelLabel">): Promise<void> {
  return new Promise((resolve) => open({ ...options, kind: "alert", resolve: () => resolve() }));
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Durée de l'animation de fermeture (globals.css, .confirm-dialog[data-closing]). */
const CLOSE_MS = 160;

export function DialogHost() {
  const request = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const ref = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !request) return;
    dialog.removeAttribute("data-closing");
    if (!dialog.open) dialog.showModal();
    confirmRef.current?.focus();
  }, [request]);

  function finish(ok: boolean) {
    const dialog = ref.current;
    if (!request || !dialog) return;
    request.resolve(ok);
    dialog.setAttribute("data-closing", "");
    const done = request;
    setTimeout(() => {
      // Une autre demande a pu arriver pendant l'animation : on la laisse ouverte.
      if (current !== done) return;
      dialog.close();
      current = null;
      emit();
    }, CLOSE_MS);
  }

  const danger = request?.tone === "danger";
  const Icon = danger ? IconTrash : request?.kind === "alert" ? IconOffline : IconHelp;

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-dialog-title"
      aria-describedby={request?.message ? "confirm-dialog-message" : undefined}
      onCancel={(e) => {
        e.preventDefault();
        finish(false);
      }}
      onClick={(e) => {
        // Clic sur le fond assombri : comme « Annuler ».
        if (e.target === e.currentTarget) finish(false);
      }}
      className="confirm-dialog m-0 mt-auto w-full max-w-none bg-transparent p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-md"
    >
      {request ? (
        <div className="confirm-dialog-panel rounded-t-3xl border border-border bg-bg p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:pb-6">
          <div aria-hidden="true" className="mx-auto -mt-2 mb-4 h-1 w-10 rounded-full bg-border sm:hidden" />
          <div className="flex items-start gap-4">
            <span
              className={`confirm-dialog-icon grid size-11 shrink-0 place-items-center rounded-2xl ${
                danger ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"
              }`}
            >
              <Icon width={22} height={22} />
            </span>
            <div className="min-w-0 pt-0.5">
              <h2 id="confirm-dialog-title" className="text-base font-semibold leading-snug">
                {request.title}
              </h2>
              {request.message ? (
                <p id="confirm-dialog-message" className="mt-1.5 text-sm leading-relaxed text-fg-muted">
                  {request.message}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            {request.kind === "confirm" ? (
              <button
                type="button"
                onClick={() => finish(false)}
                className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-bg-muted"
              >
                {request.cancelLabel ?? "Annuler"}
              </button>
            ) : null}
            <button
              ref={confirmRef}
              type="button"
              onClick={() => finish(true)}
              className={`rounded-xl px-4 py-2.5 text-sm font-medium transition-[background-color,transform] active:scale-[0.97] ${
                danger ? "bg-danger text-danger-fg hover:opacity-90" : "bg-accent text-accent-fg hover:bg-accent-hover"
              }`}
            >
              {request.confirmLabel ?? (request.kind === "alert" ? "Compris" : "Confirmer")}
            </button>
          </div>
        </div>
      ) : null}
    </dialog>
  );
}

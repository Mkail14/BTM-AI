"use client";

import { useRef } from "react";
import { confirmDialog } from "@/components/ui/ConfirmDialog";
import { IconClose, IconTrash } from "@/components/ui/icons";
import { forgetMemoryAction, setMemoryOnAction } from "./actions";
import { DANGER, Feedback, SECONDARY, SettingsGroup, useSave } from "./ui";

/**
 * Mémoire de Tamilya, comme chez ChatGPT : une seule ligne (interrupteur + « Gérer ») ;
 * la liste des souvenirs s'ouvre dans une fenêtre, effaçables un par un ou d'un coup.
 */
export function TamilyaMemory({ facts, on }: { facts: { kind: string; content: string }[]; on: boolean }) {
  const { pending, state, run } = useSave();
  const dialog = useRef<HTMLDialogElement>(null);

  async function forgetAll() {
    const ok = await confirmDialog({
      title: "Tout faire oublier à Tamilya ?",
      message: "Elle ne se souviendra plus de rien te concernant.",
      confirmLabel: "Tout effacer",
      tone: "danger",
    });
    if (ok) run(() => forgetMemoryAction());
  }

  return (
    <SettingsGroup title="Mémoire">
      <div className="flex min-h-16 items-center gap-4 px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Souvenirs</p>
          <p className="mt-0.5 text-sm text-fg-muted">{on ? "Tamilya retient ce que tu lui dis sur toi pour mieux te répondre." : "Coupée : Tamilya ne retient plus rien."}</p>
          <Feedback state={state} />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center">
          <input
            type="checkbox"
            role="switch"
            aria-label="Mémoire de Tamilya"
            checked={on}
            disabled={pending}
            onChange={(e) => run(() => setMemoryOnAction(e.target.checked))}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-6 w-10 shrink-0 rounded-full bg-border transition peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
          />
        </label>
        <button type="button" onClick={() => dialog.current?.showModal()} className={SECONDARY}>
          Gérer
        </button>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="memoire-titre"
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
        className="confirm-dialog m-0 mt-auto w-full max-w-none bg-transparent p-0 text-fg backdrop:bg-black/50 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-md"
      >
        <div className="confirm-dialog-panel flex max-h-[80dvh] flex-col rounded-t-3xl border border-border bg-bg p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl sm:pb-6">
          <div className="flex items-center justify-between gap-3">
            <h2 id="memoire-titre" className="text-base font-semibold">
              Ce que Tamilya retient
            </h2>
            <button type="button" onClick={() => dialog.current?.close()} aria-label="Fermer" className="grid size-9 place-items-center rounded-full text-fg-muted transition hover:bg-bg-muted hover:text-fg">
              <IconClose width={18} height={18} />
            </button>
          </div>

          {facts.length ? (
            <ul className="mt-4 min-h-0 flex-1 divide-y divide-border overflow-y-auto rounded-2xl border border-border">
              {facts.map((fact) => (
                <li key={fact.kind} className="flex items-center gap-2 py-2 pr-1.5 pl-4">
                  <p className="min-w-0 flex-1 text-sm break-words">{fact.content}</p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => forgetMemoryAction(fact.kind))}
                    aria-label={`Oublier : ${fact.content}`}
                    className="grid size-9 shrink-0 place-items-center rounded-full text-fg-muted transition hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                  >
                    <IconTrash width={16} height={16} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-fg-muted">Tamilya n&apos;a encore rien retenu de toi. Dis-lui par exemple ton prénom ou ta commune : elle s&apos;en souviendra.</p>
          )}

          {facts.length ? (
            <div className="mt-4 flex justify-end">
              <button type="button" disabled={pending} onClick={forgetAll} className={DANGER}>
                Tout effacer
              </button>
            </div>
          ) : null}
        </div>
      </dialog>
    </SettingsGroup>
  );
}

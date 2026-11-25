"use client";

import { useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { lostStatus } from "@/lib/safe-action";
import { deleteAccountAction } from "./actions";
import { DELETE_CONFIRMATION } from "./confirmation";
import { closeEditor, DANGER, INPUT_CLASS, RowEditor, SECONDARY, SettingsRow } from "./ui";

/** Suppression définitive : elle se déplie à la demande, puis il faut recopier le mot de confirmation. */
export function DeleteAccount({ email, isAdmin }: { email: string | null; isAdmin: boolean }) {
  const { signOut } = useAuth();
  const inputId = useId();
  const [opened, setOpened] = useState(useSearchParams().get("rubrique") === "suppression");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = typed.trim().toUpperCase() === DELETE_CONFIRMATION;

  function remove() {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction(DELETE_CONFIRMATION).catch(lostStatus);
      if (result.status === "error") {
        setError(result.message ?? "La suppression a échoué.");
        return;
      }
      // L’application oublie la session supprimée et revient à l’accueil.
      await signOut();
    });
  }

  return (
    <>
      {!opened ? (
        <SettingsRow label="Supprimer le compte">
          <button type="button" onClick={() => setOpened(true)} className={DANGER}>
            Supprimer
          </button>
        </SettingsRow>
      ) : (
        <RowEditor onClose={() => setOpened(false)}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              remove();
            }}
          >
            <p className="text-sm text-fg-muted">
              <span className="font-medium text-fg">{email ?? "Ton compte"}</span> et tout ce qui va avec seront effacés : conversations, mémoire, adresses, avis. Ton solde t&apos;est remboursé (sauf compte banni).
              {isAdmin ? " Tu perdras aussi l'accès au tableau de bord." : null}
            </p>

            <div>
              <label htmlFor={inputId} className="block text-sm font-medium">
                Pour confirmer, écris <span className="font-mono text-danger">{DELETE_CONFIRMATION}</span>
              </label>
              <input id={inputId} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} autoFocus className={`${INPUT_CLASS} font-mono tracking-wide sm:max-w-xs`} />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="submit"
                disabled={!ready || pending}
                className="inline-flex h-10 items-center justify-center rounded-full bg-danger px-5 text-sm font-medium text-danger-fg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pending ? "Suppression…" : "Supprimer définitivement"}
              </button>
              <button type="button" disabled={pending} onClick={() => closeEditor(() => setOpened(false))} className={SECONDARY}>
                Annuler
              </button>
            </div>
          </form>
        </RowEditor>
      )}
    </>
  );
}

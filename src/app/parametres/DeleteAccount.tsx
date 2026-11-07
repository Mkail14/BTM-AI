"use client";

import { useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { lostStatus } from "@/lib/safe-action";
import { deleteAccountAction } from "./actions";
import { DELETE_CONFIRMATION } from "./confirmation";
import { DANGER, INPUT_CLASS, RowEditor, SECONDARY, SettingsGroup, SettingsRow } from "./ui";

const LOST = [
  "Toutes tes conversations avec Tamilya et leurs messages",
  "Ton profil et ton nom affiché",
  "Ce que Tamilya a retenu de toi, tes adresses et ton avis",
  "Le solde de ton portefeuille",
  "Ton accès : il faudra créer un nouveau compte pour revenir",
];

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
    <SettingsGroup title="Zone sensible">
      {!opened ? (
        <SettingsRow label="Mon compte" value="Efface ton compte et toutes tes données, pour de bon.">
          <button type="button" onClick={() => setOpened(true)} className={DANGER}>
            Supprimer
          </button>
        </SettingsRow>
      ) : (
        <RowEditor>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              remove();
            }}
          >
            <div className="text-sm">
              <p>
                Le compte <span className="font-medium">{email ?? "actuel"}</span> sera effacé, avec&nbsp;:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-fg-muted">
                {LOST.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            {isAdmin ? (
              <p className="text-sm text-fg-muted">
                Compte administrateur : tu perdras l&apos;accès au tableau de bord. Le compte administrateur principal de GROUPE BTM est protégé et ne peut pas être supprimé.
              </p>
            ) : null}

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
              <button type="button" disabled={pending} onClick={() => setOpened(false)} className={SECONDARY}>
                Annuler
              </button>
            </div>
          </form>
        </RowEditor>
      )}
    </SettingsGroup>
  );
}

"use client";

import { useId, useState, useTransition } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { IconTrash } from "@/components/ui/icons";
import { deleteAccountAction } from "./actions";
import { DELETE_CONFIRMATION } from "./confirmation";

const LOST = [
  "Toutes vos conversations avec Awa et leurs messages",
  "Votre profil, votre nom affiché et la personnalité choisie",
  "Votre accès : il faudra créer un nouveau compte pour revenir",
];

/** Suppression définitive : il faut recopier le mot de confirmation. */
export function DeleteAccount({ email, isAdmin }: { email: string | null; isAdmin: boolean }) {
  const { signOut } = useAuth();
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const ready = typed.trim().toUpperCase() === DELETE_CONFIRMATION;

  function remove() {
    if (!ready) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction(DELETE_CONFIRMATION);
      if (result.status === "error") {
        setError(result.message ?? "La suppression a échoué.");
        return;
      }
      // L’application oublie la session supprimée et revient à l’accueil.
      await signOut();
    });
  }

  return (
    <div className="max-w-xl space-y-5">
      <div className="rounded-xl border border-danger/30 bg-danger-soft p-4">
        <p className="font-medium text-danger">Cette action est définitive.</p>
        <p className="mt-1 text-sm">
          Le compte <span className="font-medium">{email ?? "actuel"}</span> sera effacé, avec&nbsp;:
        </p>
        <ul className="mt-2 space-y-1 text-sm">
          {LOST.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden="true" className="text-danger">
                ×
              </span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {isAdmin ? (
        <p className="rounded-xl border border-border bg-bg-subtle p-3 text-sm text-fg-muted">
          Compte administrateur : vous perdrez l&apos;accès au tableau de bord. Le compte administrateur principal de
          GROUPE BTM est protégé et ne peut pas être supprimé.
        </p>
      ) : null}

      <div>
        <label htmlFor={inputId} className="block text-sm font-medium">
          Pour confirmer, écrivez <span className="font-mono text-danger">{DELETE_CONFIRMATION}</span>
        </label>
        <input
          id={inputId}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3 py-2.5 font-mono tracking-wide outline-none focus:border-danger"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}

      <button
        type="button"
        onClick={remove}
        disabled={!ready || pending}
        className="inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2.5 font-medium text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <IconTrash width={16} height={16} />
        {pending ? "Suppression…" : "Supprimer définitivement mon compte"}
      </button>
    </div>
  );
}

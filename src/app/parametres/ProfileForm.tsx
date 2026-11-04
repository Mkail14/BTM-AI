"use client";

import { useActionState, useState } from "react";
import { updateProfileAction, type ProfileFormState } from "./actions";

/** Nom affiché en lecture seule : le champ ne s'ouvre qu'après un clic sur « Modifier ». */
export function ProfileForm({ displayName }: { displayName: string | null }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    async (previous, formData) => {
      const result = await updateProfileAction(previous, formData);
      // Enregistré : on revient à l'affichage simple.
      if (result.status === "saved") setEditing(false);
      return result;
    },
    { status: "idle" },
  );

  const message = state.message ? (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={`text-sm ${state.status === "error" ? "text-danger" : "text-success"}`}
    >
      {state.message}
    </p>
  ) : null;

  if (!editing) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Nom affiché</p>
            <p className="truncate text-sm text-fg-muted">{displayName || "Aucun nom"}</p>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-xl border border-border px-3 py-2 text-sm font-medium whitespace-nowrap hover:bg-bg-muted"
          >
            Modifier
          </button>
        </div>
        {message}
      </div>
    );
  }

  return (
    <form action={formAction} className="max-w-xl space-y-5">
      <div>
        <label htmlFor="displayName" className="block text-sm font-medium">
          Nom affiché
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={displayName ?? ""}
          maxLength={60}
          autoComplete="nickname"
          placeholder="Ton prénom"
          autoFocus
          className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3 py-2.5 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
        />
        <p className="mt-1.5 text-xs text-fg-muted">Affiché dans le menu, et sous la forme « Prénom N. » si tu publies un avis.</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="rounded-xl border border-border px-4 py-2.5 font-medium hover:bg-bg-muted"
        >
          Annuler
        </button>
        {state.status === "error" ? message : null}
      </div>
    </form>
  );
}

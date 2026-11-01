"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileFormState } from "./actions";

export function ProfileForm({ displayName }: { displayName: string | null }) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(updateProfileAction, {
    status: "idle",
  });

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
          placeholder="Votre prénom"
          className="mt-1.5 w-full rounded-xl border border-border bg-bg px-3 py-2.5 outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft"
        />
        <p className="mt-1.5 text-xs text-fg-muted">Visible uniquement par vous, dans le menu.</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-accent px-4 py-2.5 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {state.message ? (
          <p
            role={state.status === "error" ? "alert" : "status"}
            className={`text-sm ${state.status === "error" ? "text-danger" : "text-success"}`}
          >
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

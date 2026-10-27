"use client";

import { useActionState } from "react";
import { updateProfileAction, type ProfileFormState } from "./actions";

export function ProfileForm({ displayName }: { displayName: string | null }) {
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(updateProfileAction, {
    status: "idle",
  });

  return (
    <form action={formAction} className="space-y-4">
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
          className="mt-1.5 w-full rounded-lg border border-border bg-bg px-3 py-2.5 outline-none focus:border-accent"
        />
        <p className="mt-1 text-xs text-fg-muted">Visible uniquement par vous, dans le menu.</p>
      </div>
      {state.message ? (
        <p role={state.status === "error" ? "alert" : "status"} className={`text-sm ${state.status === "error" ? "text-danger" : "text-accent"}`}>
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}

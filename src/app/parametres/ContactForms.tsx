"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { savePhoneAction, type ProfileFormState } from "./actions";

export const INPUT_CLASS =
  "mt-1.5 w-full rounded-xl border border-border bg-bg px-3.5 py-2.5 text-base outline-none transition focus:border-accent focus:ring-4 focus:ring-accent-soft sm:text-sm";
export const PRIMARY = "rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg hover:bg-accent-hover disabled:opacity-60";
export const SECONDARY = "rounded-xl border border-border px-3.5 py-2 text-sm font-medium whitespace-nowrap hover:bg-bg-muted disabled:opacity-60";

export function Feedback({ state }: { state: ProfileFormState | null }) {
  if (!state?.message) return null;
  return (
    <p role={state.status === "error" ? "alert" : "status"} className={`text-sm ${state.status === "error" ? "text-danger" : "text-success"}`}>
      {state.message}
    </p>
  );
}

/** Lance une action serveur, garde son résultat et relit la page si elle a réussi. */
export function useSave() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ProfileFormState | null>(null);
  const run = (action: () => Promise<ProfileFormState>, after?: () => void) =>
    start(async () => {
      const result = await action();
      setState(result);
      if (result.status === "saved") {
        after?.();
        router.refresh();
      }
    });
  return { pending, state, run };
}

/** Téléphone : seul le numéro masqué est connu ici ; on peut le remplacer. */
export function PhoneRow({ maskedPhone }: { maskedPhone: string | null }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const { pending, state, run } = useSave();

  if (!editing) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Téléphone</p>
            <p className="truncate text-sm text-fg-muted tabular-nums">{maskedPhone ?? "Aucun numéro"}</p>
          </div>
          <button type="button" onClick={() => setEditing(true)} className={SECONDARY}>
            {maskedPhone ? "Changer" : "Ajouter"}
          </button>
        </div>
        <Feedback state={state} />
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => savePhoneAction(phone), () => setEditing(false));
      }}
    >
      <div>
        <label htmlFor={`${id}-phone`} className="block text-sm font-medium">
          Téléphone
        </label>
        <input
          id={`${id}-phone`}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          maxLength={30}
          placeholder="0639 12 34 56"
          autoFocus
          className={INPUT_CLASS}
        />
        <p className="mt-1.5 text-xs text-fg-muted">Pour le livreur et pour te rappeler (réservation du code). Jamais affiché en entier.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" disabled={pending} onClick={() => setEditing(false)} className={SECONDARY}>
          Annuler
        </button>
        {state?.status === "error" ? <Feedback state={state} /> : null}
      </div>
    </form>
  );
}

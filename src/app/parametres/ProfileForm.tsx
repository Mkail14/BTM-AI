"use client";

import { useActionState, useId, useState } from "react";
import { savePhoneAction, updateProfileAction, type ProfileFormState } from "./actions";
import { Feedback, INPUT_CLASS, PRIMARY, RowEditor, SECONDARY, SettingsRow, useSave } from "./ui";

/** Nom affiché : le champ ne s'ouvre qu'après un clic sur « Modifier ». */
export function NameRow({ displayName }: { displayName: string | null }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ProfileFormState, FormData>(
    async (previous, formData) => {
      const result = await updateProfileAction(previous, formData);
      if (result.status === "saved") setEditing(false);
      return result;
    },
    { status: "idle" },
  );

  if (!editing) {
    return (
      <SettingsRow label="Nom affiché" value={displayName || "Aucun nom"}>
        <button type="button" onClick={() => setEditing(true)} className={SECONDARY}>
          Modifier
        </button>
      </SettingsRow>
    );
  }

  return (
    <RowEditor>
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
            placeholder="Ton prénom"
            autoFocus
            className={INPUT_CLASS}
          />
          <p className="mt-1.5 text-xs text-fg-muted">Affiché dans le menu, et sous la forme « Prénom N. » si tu publies un avis.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={pending} className={SECONDARY}>
            Annuler
          </button>
          {state.status === "error" ? <Feedback state={state} /> : null}
        </div>
      </form>
    </RowEditor>
  );
}

/** Téléphone : seul le numéro masqué est connu ici ; on peut le remplacer. */
export function PhoneRow({ maskedPhone }: { maskedPhone: string | null }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const { pending, state, run } = useSave();

  if (!editing) {
    return (
      <SettingsRow label="Téléphone" value={<span className="tabular-nums">{maskedPhone ?? "Aucun numéro"}</span>}>
        <button type="button" onClick={() => setEditing(true)} className={SECONDARY}>
          {maskedPhone ? "Changer" : "Ajouter"}
        </button>
      </SettingsRow>
    );
  }

  return (
    <RowEditor>
      <form
        className="space-y-4"
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
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" disabled={pending} onClick={() => setEditing(false)} className={SECONDARY}>
            Annuler
          </button>
          {state?.status === "error" ? <Feedback state={state} /> : null}
        </div>
      </form>
    </RowEditor>
  );
}

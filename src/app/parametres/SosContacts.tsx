"use client";

import { useState } from "react";
import { saveSosContactsAction } from "./actions";
import { Feedback, INPUT_CLASS, PRIMARY, RowEditor, SECONDARY, SettingsRow, useSave } from "./ui";

const MAX = 4;

/**
 * Proches à prévenir : si la personne écrit « SOS » dans Tamilya Connect (app Android),
 * ils reçoivent un mail avec sa position et sa batterie. Une ligne du cadre Sécurité.
 */
export function SosContacts({ contacts }: { contacts: string[] }) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<string[]>(() => Array.from({ length: MAX }, (_, i) => contacts[i] ?? ""));
  const { pending, state, run } = useSave();

  const open = () => {
    setFields(Array.from({ length: MAX }, (_, i) => contacts[i] ?? ""));
    setEditing(true);
  };

  if (!editing) {
    const count = contacts.length;
    return (
      <SettingsRow label="Proches SOS" value={count ? `${count} proche${count > 1 ? "s" : ""}` : "Aucun"}>
        <button type="button" onClick={open} className={SECONDARY}>
          {count ? "Modifier" : "Ajouter"}
        </button>
      </SettingsRow>
    );
  }

  return (
    <RowEditor>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => saveSosContactsAction(fields), () => setEditing(false));
        }}
      >
        <p className="text-sm text-fg-muted">
          Écris « SOS » à Tamilya Connect (app Android) : ils reçoivent ta position si un relais est proche. En danger, appelle le 112.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((value, i) => (
            <label key={i} className="block text-sm font-medium">
              Proche {i + 1}
              <input
                type="email"
                inputMode="email"
                autoComplete="off"
                value={value}
                placeholder="adresse@exemple.fr"
                onChange={(e) => setFields((list) => list.map((v, j) => (j === i ? e.target.value : v)))}
                className={INPUT_CLASS}
              />
            </label>
          ))}
        </div>
        <Feedback state={state} />
        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={pending} className={PRIMARY}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button type="button" disabled={pending} onClick={() => setEditing(false)} className={SECONDARY}>
            Annuler
          </button>
        </div>
      </form>
    </RowEditor>
  );
}

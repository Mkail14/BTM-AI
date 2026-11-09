"use client";

import { useState } from "react";
import { saveSosContactsAction } from "./actions";
import { Feedback, INPUT_CLASS, PRIMARY, RowEditor, SECONDARY, SettingsGroup, SettingsRow, useSave } from "./ui";

const MAX = 4;

/**
 * Proches à prévenir : si la personne écrit « SOS » dans Tamilya Connect (app Android),
 * ils reçoivent un mail avec sa position et sa batterie.
 */
export function SosContacts({ contacts }: { contacts: string[] }) {
  const [editing, setEditing] = useState(false);
  const [fields, setFields] = useState<string[]>(() => Array.from({ length: MAX }, (_, i) => contacts[i] ?? ""));
  const { pending, state, run } = useSave();

  const open = () => {
    setFields(Array.from({ length: MAX }, (_, i) => contacts[i] ?? ""));
    setEditing(true);
  };

  return (
    <div className="space-y-6">
      <SettingsGroup
        title="Proches à prévenir"
        description="Jusqu'à 4 adresses e-mail. Dans l'app Android, écris « SOS » à Tamilya Connect : ils reçoivent ta position et ta batterie, même sans internet de ton côté si un relais est proche."
        footer={<Feedback state={state} />}
      >
        {editing ? (
          <RowEditor>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                run(() => saveSosContactsAction(fields), () => setEditing(false));
              }}
            >
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
              <p className="text-xs text-fg-muted">Chaque nouveau proche reçoit un mail pour lui dire qu&apos;il a été choisi. Préviens-le aussi de vive voix.</p>
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
        ) : contacts.length ? (
          <>
            {contacts.map((email, i) => (
              <SettingsRow key={email} label={`Proche ${i + 1}`} value={email} />
            ))}
            <SettingsRow label="Modifier la liste">
              <button type="button" onClick={open} className={SECONDARY}>
                Modifier
              </button>
            </SettingsRow>
          </>
        ) : (
          <SettingsRow label="Aucun proche" value="Personne ne sera prévenu pour l'instant.">
            <button type="button" onClick={open} className={SECONDARY}>
              Ajouter
            </button>
          </SettingsRow>
        )}
      </SettingsGroup>
      <p className="text-sm text-fg-muted">
        L&apos;alerte part seulement si ton message trouve un relais : regarde le compteur de téléphones autour avant d&apos;envoyer. Sans relais, déplace-toi. BTM ne peut rien garantir. En danger, appelle le 112.
      </p>
    </div>
  );
}

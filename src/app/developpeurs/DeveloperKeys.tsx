"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { inputClass, secondaryButton } from "@/components/admin/form";
import type { DeveloperKey } from "@/lib/developers/keys";
import { createDeveloperKeyAction, revokeDeveloperKeyAction } from "./actions";

const date = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Indian/Mayotte" });

/** Codes d'accès de l'utilisateur : création (code montré une seule fois) et suppression. */
export function DeveloperKeys({ keys, max }: { keys: DeveloperKey[]; max: number }) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      setError(null);
      const result = await createDeveloperKeyAction(label);
      if (!result.ok) return setError(result.message);
      setCreated(result.key);
      setCopied(false);
      setLabel("");
      router.refresh();
    });

  const revoke = (key: DeveloperKey) => {
    if (!window.confirm(`Supprimer le code « ${key.label} » ? Les applications qui l'utilisent ne marcheront plus.`)) return;
    startTransition(async () => {
      const result = await revokeDeveloperKeyAction(key.id);
      if (!result.ok) setError("La suppression a échoué. Réessayez.");
      router.refresh();
    });
  };

  const copy = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {created ? (
        <div className="rounded-2xl border border-success/40 bg-success/10 p-4">
          <p className="text-sm font-medium">Votre nouveau code</p>
          <p className="mt-1 text-xs text-fg-muted">Copiez-le maintenant : il ne sera plus jamais affiché.</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-bg px-3 py-2 font-mono text-xs">{created}</code>
            <button type="button" onClick={copy} className={secondaryButton}>
              {copied ? "Copié ✓" : "Copier"}
            </button>
          </div>
        </div>
      ) : null}

      {keys.length > 0 ? (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-bg">
          {keys.map((key) => (
            <li key={key.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{key.label}</p>
                <p className="text-xs text-fg-muted">
                  <span className="font-mono">{key.prefix}…</span> · créé le {date.format(new Date(key.createdAt))}
                  {" · "}
                  {key.lastUsedAt ? `utilisé le ${date.format(new Date(key.lastUsedAt))}` : "jamais utilisé"}
                </p>
              </div>
              <button type="button" onClick={() => revoke(key)} disabled={pending} className={`${secondaryButton} shrink-0 text-danger`}>
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-fg-muted">Vous n&apos;avez pas encore de code.</p>
      )}

      {keys.length < max ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            create();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <label htmlFor="key-label" className="sr-only">
            Nom du code
          </label>
          <input
            id="key-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={40}
            placeholder="Nom du code (ex. Mon appli)"
            className={`${inputClass} h-10 rounded-full px-4`}
          />
          <button type="submit" disabled={pending || !label.trim()} className="btn-rose h-10 shrink-0 rounded-full px-5 text-sm font-medium">
            Créer un code
          </button>
        </form>
      ) : (
        <p className="text-xs text-fg-muted">{max} codes au plus : supprimez-en un pour en créer un autre.</p>
      )}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

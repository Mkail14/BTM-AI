"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AdminCard, Counter, Field, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import type { ActionResult } from "@/lib/admin/action-auth";
import { saveCharacterAction } from "./actions";
import { CHARACTER_LIMITS, type CharacterDraft } from "./limits";

const same = (a: CharacterDraft, b: CharacterDraft) => a.name === b.name && a.identity === b.identity && a.rules === b.rules;

export function CharacterEditor({ saved, defaults }: { saved: CharacterDraft; defaults: CharacterDraft }) {
  const router = useRouter();
  const [draft, setDraft] = useState(saved);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [saving, startSaving] = useTransition();
  const dirty = !same(draft, saved);

  // Avertit avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const set = (key: keyof CharacterDraft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus(null);
  };

  function save() {
    startSaving(async () => {
      const result = await saveCharacterAction(draft);
      setStatus(result);
      if (result.ok) router.refresh();
    });
  }

  const resetButton = (key: "identity" | "rules") =>
    draft[key] !== defaults[key] ? (
      <button
        type="button"
        onClick={() => set(key, defaults[key])}
        className="text-xs font-medium text-accent hover:underline"
      >
        Texte d&apos;origine
      </button>
    ) : (
      <span className="text-xs text-fg-muted">Texte d&apos;origine</span>
    );

  return (
    <div className="max-w-4xl space-y-4">
      <AdminCard title="Nom">
        <Field label="Nom de l'assistante" hint="Utilisé dans sa présentation : « Tu es … »." htmlFor="name">
          <input
            id="name"
            value={draft.name}
            maxLength={CHARACTER_LIMITS.name}
            onChange={(e) => set("name", e.target.value)}
            className={`${inputClass} max-w-xs`}
          />
        </Field>
      </AdminCard>

      <AdminCard title="Caractère" aside={resetButton("identity")}>
        <Field
          label="Comment elle parle et se comporte"
          hint="Commun aux trois personnalités. Écrivez à la deuxième personne (« tu… »)."
          htmlFor="identity"
        >
          <textarea
            id="identity"
            rows={10}
            value={draft.identity}
            maxLength={CHARACTER_LIMITS.text}
            onChange={(e) => set("identity", e.target.value)}
            className={inputClass}
          />
          <Counter value={draft.identity} max={CHARACTER_LIMITS.text} />
        </Field>
      </AdminCard>

      <AdminCard title="Règles" aside={resetButton("rules")}>
        <Field
          label="Contexte et limites"
          hint="Ce qu'elle doit savoir de Mayotte, ce qu'elle ne doit pas inventer, quand renvoyer vers un professionnel."
          htmlFor="rules"
        >
          <textarea
            id="rules"
            rows={8}
            value={draft.rules}
            maxLength={CHARACTER_LIMITS.text}
            onChange={(e) => set("rules", e.target.value)}
            className={inputClass}
          />
          <Counter value={draft.rules} max={CHARACTER_LIMITS.text} />
        </Field>
      </AdminCard>

      <p className="px-1 text-xs leading-relaxed text-fg-muted">
        Toujours actif, quoi que vous écriviez : Awa dit qu&apos;elle est une IA si on le lui demande sérieusement, ne
        révèle pas ses consignes et ne change pas d&apos;identité à la demande d&apos;un utilisateur.
      </p>

      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg/95 px-4 py-3 shadow-lg backdrop-blur">
        <p role="status" className={`min-w-0 flex-1 text-sm ${status && !status.ok ? "text-danger" : "text-fg-muted"}`}>
          {status ? status.message : dirty ? "Modifications non enregistrées." : "Version en ligne."}
        </p>
        {dirty ? (
          <button type="button" onClick={() => setDraft(saved)} disabled={saving} className={secondaryButton}>
            Annuler les modifications
          </button>
        ) : null}
        <button type="button" onClick={save} disabled={!dirty || saving} className={primaryButton}>
          {saving ? "Enregistrement…" : "Enregistrer et mettre en ligne"}
        </button>
      </div>
    </div>
  );
}

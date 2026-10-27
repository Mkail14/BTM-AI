"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconRetry, IconShield } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import { saveCharacterAction } from "./actions";
import { CHARACTER_LIMITS, type CharacterDraft } from "./limits";

const TEXTS = [
  {
    id: "identity",
    label: "Caractère",
    hint: "Sa façon de parler et d'agir, commune aux personnalités. Écrire « Tu… ».",
  },
  {
    id: "rules",
    label: "Règles",
    hint: "Contexte de Mayotte, ce qu'elle ne doit pas inventer, quand renvoyer vers un pro.",
  },
] as const;

export const sameCharacter = (a: CharacterDraft, b: CharacterDraft) =>
  a.name === b.name && a.identity === b.identity && a.rules === b.rules;

/**
 * Formulaire « Caractère et règles », partagé par la page et la fenêtre du schéma.
 * Il remplit la hauteur de son parent (flex colonne de hauteur fixée) : seuls les
 * textes défilent, jamais la page.
 */
export function CharacterForm({
  saved,
  defaults,
  onCancel,
  onSaved,
  onDirtyChange,
}: {
  saved: CharacterDraft;
  defaults: CharacterDraft;
  /** Absent : « Annuler » remet simplement la version en ligne. */
  onCancel?: () => void;
  onSaved?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(saved);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [saving, startSaving] = useTransition();
  const dirty = !sameCharacter(draft, saved);

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

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
      if (result.ok) {
        router.refresh();
        onSaved?.();
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-bg px-4 py-3">
        <label htmlFor="character-name" className="text-sm font-medium">
          Nom
        </label>
        <input
          id="character-name"
          value={draft.name}
          maxLength={CHARACTER_LIMITS.name}
          onChange={(e) => set("name", e.target.value)}
          className={`${inputClass} w-40 py-1.5 font-medium`}
        />
        <span className="text-xs text-fg-muted">
          « Je suis <span className="font-medium text-fg">{draft.name.trim() || "…"}</span> »
        </span>
        <span className="flex items-center gap-1.5 text-xs text-fg-muted sm:ml-auto">
          <IconShield width={14} height={14} className="shrink-0 text-accent" />
          Toujours actif : elle dit être une IA, garde ses consignes et ne change pas d&apos;identité.
        </span>
      </div>

      {/* Petit écran : les deux textes s'empilent et cette zone défile seule. */}
      <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-3 lg:grid-cols-2 lg:overflow-hidden">
        {TEXTS.map((text) => {
          const value = draft[text.id];
          const id = `character-${text.id}`;
          return (
            <div
              key={text.id}
              className="flex min-h-72 flex-col overflow-hidden rounded-xl border border-border bg-bg focus-within:border-accent lg:min-h-0"
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
                <label htmlFor={id} className="text-sm font-semibold">
                  {text.label}
                </label>
                {value !== saved[text.id] ? (
                  <span aria-label="modifié" title="Modifié" className="size-1.5 shrink-0 rounded-full bg-accent" />
                ) : null}
                <span className="min-w-0 flex-1 truncate text-xs text-fg-muted" title={text.hint}>
                  {text.hint}
                </span>
                {value !== defaults[text.id] ? (
                  <button
                    type="button"
                    onClick={() => set(text.id, defaults[text.id])}
                    title="Remettre le texte d'origine"
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fg-muted hover:bg-bg-muted hover:text-fg"
                  >
                    <IconRetry width={12} height={12} />
                    Original
                  </button>
                ) : null}
              </div>
              <textarea
                id={id}
                value={value}
                maxLength={CHARACTER_LIMITS.text}
                onChange={(e) => set(text.id, e.target.value)}
                className="min-h-0 w-full flex-1 resize-none bg-transparent px-3 py-2.5 text-sm leading-relaxed outline-none"
              />
              <span
                className={`shrink-0 border-t border-border px-3 py-1 text-right text-[11px] tabular-nums ${
                  value.length > CHARACTER_LIMITS.text * 0.9 ? "font-medium text-danger" : "text-fg-muted"
                }`}
              >
                {value.length.toLocaleString("fr-FR")} / {CHARACTER_LIMITS.text.toLocaleString("fr-FR")}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-3 border-t border-border bg-bg px-4 py-2.5">
        <p
          role="status"
          className={`flex min-w-0 flex-1 items-center gap-2 text-sm ${status && !status.ok ? "text-danger" : "text-fg-muted"}`}
        >
          {status ? (
            status.message
          ) : (
            <>
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dirty ? "bg-accent" : "bg-success"}`} />
              {dirty ? "Modifications non enregistrées" : "À jour"}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => (onCancel ? onCancel() : setDraft(saved))}
          disabled={saving || (!onCancel && !dirty)}
          className={secondaryButton}
        >
          Annuler
        </button>
        <button type="submit" disabled={!dirty || saving || !draft.name.trim()} className={primaryButton}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

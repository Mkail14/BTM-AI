"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ComponentType, type SVGProps } from "react";
import { IconBook, IconLock, IconRetry, IconShield, IconSparkle } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import { AWA_BIRTH_LABEL, AWA_NAME, awaAge } from "@/lib/ai/awa-identity";
import { lostOk } from "@/lib/safe-action";
import { saveCharacterAction } from "./actions";
import { CHARACTER_LIMITS, type CharacterDraft } from "./limits";

const TEXTS: { id: keyof CharacterDraft; label: string; hint: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  {
    id: "identity",
    label: "Caractère",
    hint: "Sa façon de parler et d'agir, commune à toutes les personnalités. Écrivez « Tu… ».",
    icon: IconSparkle,
  },
  {
    id: "rules",
    label: "Règles",
    hint: "Contexte de Mayotte, ce qu'elle ne doit pas inventer, quand renvoyer vers un professionnel.",
    icon: IconBook,
  },
];

/** Toujours actif, quel que soit le texte enregistré. */
const GUARANTEES = ["Dit qu'elle est une IA", "Garde ses consignes", "Ne change pas d'identité"];

export const sameCharacter = (a: CharacterDraft, b: CharacterDraft) => a.identity === b.identity && a.rules === b.rules;

/** Fiche d'identité de Tamilya : fixée par GROUPE BTM, en lecture seule. */
function IdentityCard() {
  const facts = ["Fille", `Née le ${AWA_BIRTH_LABEL}`, awaAge(new Date()), "Créée par GROUPE BTM"];
  return (
    <section
      aria-label="Identité de Tamilya"
      className="relative shrink-0 overflow-hidden rounded-2xl border border-border bg-bg p-4 sm:p-5"
    >
      {/* Halo de la couleur de Tamilya, purement décoratif. */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 -left-16 size-64 rounded-full bg-accent/15 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-4">
          <span
            aria-hidden="true"
            className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-hover text-2xl font-semibold text-accent-fg shadow-lg shadow-accent/25"
          >
            {AWA_NAME[0]}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl leading-none font-semibold tracking-tight">{AWA_NAME}</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-muted px-2 py-0.5 text-[11px] font-medium text-fg-muted">
                <IconLock width={11} height={11} /> Fixé par GROUPE BTM
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {facts.map((fact) => (
                <li key={fact} className="rounded-full border border-border bg-bg-subtle px-2.5 py-0.5 text-xs">
                  {fact}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <ul aria-label="Toujours actif" className="flex flex-wrap gap-1.5 lg:ml-auto">
          {GUARANTEES.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent"
            >
              <IconShield width={13} height={13} className="shrink-0" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

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
  className = "",
}: {
  saved: CharacterDraft;
  defaults: CharacterDraft;
  /** Absent : « Annuler » remet simplement la version en ligne. */
  onCancel?: () => void;
  onSaved?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  className?: string;
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
      const result = await saveCharacterAction(draft).catch(lostOk);
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
      className={`flex min-h-0 flex-1 flex-col gap-4 ${className}`}
    >
      <IdentityCard />

      {/* Petit écran : les deux textes s'empilent et cette zone défile seule. */}
      <div className="grid grid-cols-1 min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
        {TEXTS.map(({ id, label, hint, icon: Icon }) => {
          const value = draft[id];
          const fieldId = `character-${id}`;
          const usage = value.length / CHARACTER_LIMITS.text;
          return (
            <div
              key={id}
              className="flex min-h-80 flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-sm transition focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10 lg:min-h-0"
            >
              <div className="flex shrink-0 items-start gap-3 px-5 pt-4 pb-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                  <Icon width={18} height={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <label htmlFor={fieldId} className="font-semibold">
                      {label}
                    </label>
                    {value !== saved[id] ? (
                      <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">Modifié</span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-fg-muted">{hint}</p>
                </div>
                {value !== defaults[id] ? (
                  <button
                    type="button"
                    onClick={() => set(id, defaults[id])}
                    title="Remettre le texte d'origine"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-fg-muted transition hover:bg-bg-muted hover:text-fg"
                  >
                    <IconRetry width={12} height={12} />
                    Rétablir
                  </button>
                ) : null}
              </div>

              <textarea
                id={fieldId}
                value={value}
                maxLength={CHARACTER_LIMITS.text}
                onChange={(e) => set(id, e.target.value)}
                className="mx-3 min-h-0 flex-1 resize-none rounded-xl bg-bg-subtle px-4 py-3 text-sm leading-7 outline-none"
              />

              <div className="flex shrink-0 items-center gap-3 px-5 py-3">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-muted" aria-hidden="true">
                  <div
                    className={`h-full rounded-full transition-all ${usage > 0.9 ? "bg-danger" : "bg-accent/60"}`}
                    style={{ width: `${Math.min(100, usage * 100)}%` }}
                  />
                </div>
                <span className={`text-[11px] tabular-nums ${usage > 0.9 ? "font-medium text-danger" : "text-fg-muted"}`}>
                  {value.length.toLocaleString("fr-FR")} / {CHARACTER_LIMITS.text.toLocaleString("fr-FR")}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex shrink-0 items-center gap-3 rounded-2xl border border-border bg-bg px-4 py-3 shadow-sm">
        <p
          role="status"
          className={`flex min-w-0 flex-1 items-center gap-2 text-sm ${
            status ? (status.ok ? "text-success" : "text-danger") : "text-fg-muted"
          }`}
        >
          {status ? (
            status.message
          ) : (
            <>
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dirty ? "animate-pulse bg-accent" : "bg-success"}`} />
              {dirty ? "Modifications non enregistrées" : "À jour"}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={() => (onCancel ? onCancel() : setDraft(saved))}
          disabled={saving || (!onCancel && !dirty)}
          className="rounded-xl border border-border px-4 py-2 text-sm font-medium transition hover:bg-bg-muted disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          type="submit"
          disabled={!dirty || saving}
          className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-accent-fg shadow-sm transition hover:bg-accent-hover disabled:opacity-40"
        >
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}

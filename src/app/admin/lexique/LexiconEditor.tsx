"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ActionStatus, AdminCard, Field, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconPlus } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import { deleteLexiconAction, saveLexiconAction } from "./actions";
import { LEXICON_LIMITS, type LexiconRow } from "./limits";

type Draft = Omit<LexiconRow, "id" | "validatedAt"> & { id: string | null };

const EMPTY: Draft = { id: null, french: "", shimaore: "", context: "", validatedBy: "", isActive: true };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });

function EntryForm({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus(null);
  };
  const prefix = draft.id ?? "new";

  function save() {
    startTransition(async () => {
      const result = await saveLexiconAction(draft);
      setStatus(result);
      if (result.ok) {
        router.refresh();
        onClose();
      }
    });
  }

  function remove() {
    if (!draft.id || !window.confirm(`Supprimer « ${initial.french} » ?`)) return;
    startTransition(async () => {
      const result = await deleteLexiconAction(draft.id);
      setStatus(result);
      if (result.ok) router.refresh();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Français" htmlFor={`${prefix}-fr`}>
          <input
            id={`${prefix}-fr`}
            value={draft.french}
            maxLength={LEXICON_LIMITS.phrase}
            placeholder="Ex. : Bonjour, comment ça va ?"
            onChange={(e) => set("french", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Shimaoré" htmlFor={`${prefix}-sh`}>
          <input
            id={`${prefix}-sh`}
            value={draft.shimaore}
            maxLength={LEXICON_LIMITS.phrase}
            onChange={(e) => set("shimaore", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Contexte" hint="Facultatif : salutation, commerce, administration…" htmlFor={`${prefix}-ctx`}>
          <input
            id={`${prefix}-ctx`}
            value={draft.context}
            maxLength={LEXICON_LIMITS.context}
            onChange={(e) => set("context", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Validé par" hint="Le locuteur qui a relu la traduction." htmlFor={`${prefix}-by`}>
          <input
            id={`${prefix}-by`}
            value={draft.validatedBy}
            maxLength={LEXICON_LIMITS.validatedBy}
            onChange={(e) => set("validatedBy", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.isActive} onChange={(e) => set("isActive", e.target.checked)} />
        Active (utilisée par Awa)
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Enregistrement…" : draft.id ? "Enregistrer" : "Ajouter l'expression"}
        </button>
        <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
          Annuler
        </button>
        {draft.id ? (
          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
          >
            Supprimer
          </button>
        ) : null}
        <ActionStatus result={status} />
      </div>
    </form>
  );
}

export function LexiconEditor({ rows }: { rows: LexiconRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const active = rows.filter((r) => r.isActive).length;
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => `${r.french} ${r.shimaore} ${r.context}`.toLowerCase().includes(q)) : rows;

  return (
    <div className="max-w-4xl space-y-4">
      {openId === "new" ? (
        <AdminCard title="Nouvelle expression">
          <EntryForm initial={EMPTY} onClose={() => setOpenId(null)} />
        </AdminCard>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setOpenId("new")} className={`${primaryButton} inline-flex items-center gap-1.5`}>
            <IconPlus width={16} height={16} /> Nouvelle expression
          </button>
          <span className="text-sm text-fg-muted">
            {rows.length} expression{rows.length > 1 ? "s" : ""} · {active} active{active > 1 ? "s" : ""}
          </span>
          {rows.length > 5 ? (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              aria-label="Rechercher une expression"
              className={`${inputClass} ml-auto max-w-xs`}
            />
          ) : null}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-bg p-6 text-center text-sm text-fg-muted">
          Aucune expression pour l&apos;instant. Ajoutez des traductions relues par un locuteur.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((row) => (
            <li key={row.id} className="rounded-xl border border-border bg-bg">
              {openId === row.id ? (
                <div className="p-5">
                  <EntryForm initial={{ ...row }} onClose={() => setOpenId(null)} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenId(row.id)}
                  className="grid w-full gap-1 rounded-xl p-4 text-left hover:bg-bg-muted md:grid-cols-[1fr_1fr_auto] md:items-center md:gap-4"
                >
                  <span className="min-w-0">
                    <span className="block font-medium break-words">{row.french}</span>
                    {row.context ? <span className="block text-xs text-fg-muted">{row.context}</span> : null}
                  </span>
                  <span className="min-w-0 break-words text-accent">{row.shimaore}</span>
                  <span className="text-xs text-fg-muted">
                    {row.isActive ? "" : "désactivée · "}
                    {row.validatedBy}, {dateFormat.format(new Date(row.validatedAt))}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

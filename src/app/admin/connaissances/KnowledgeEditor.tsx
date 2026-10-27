"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  ActionStatus,
  AdminCard,
  Counter,
  Field,
  inputClass,
  primaryButton,
  secondaryButton,
} from "@/components/admin/form";
import { IconPlus } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import { deleteKnowledgeAction, saveKnowledgeAction } from "./actions";
import { KNOWLEDGE_LIMITS, type KnowledgeRow } from "./limits";

type Draft = { id: string | null; title: string; content: string; keywords: string; isActive: boolean };

const EMPTY: Draft = { id: null, title: "", content: "", keywords: "", isActive: true };

const toDraft = (row: KnowledgeRow): Draft => ({ ...row, keywords: row.keywords.join(", ") });
const splitKeywords = (value: string) => value.split(",").map((k) => k.trim()).filter(Boolean);

/** Formulaire d'une fiche (nouvelle ou existante). */
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
      const result = await saveKnowledgeAction({ ...draft, keywords: splitKeywords(draft.keywords) });
      setStatus(result);
      if (result.ok) {
        router.refresh();
        onClose();
      }
    });
  }

  function remove() {
    if (!draft.id || !window.confirm(`Supprimer la fiche « ${initial.title} » ?`)) return;
    startTransition(async () => {
      const result = await deleteKnowledgeAction(draft.id);
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
      <Field label="Titre" htmlFor={`${prefix}-title`}>
        <input
          id={`${prefix}-title`}
          value={draft.title}
          maxLength={KNOWLEDGE_LIMITS.title}
          placeholder="Ex. : Refaire sa carte d'identité à Mayotte"
          onChange={(e) => set("title", e.target.value)}
          className={inputClass}
        />
      </Field>
      <Field label="Contenu" hint="Les informations vérifiées, telles qu'Awa doit les donner." htmlFor={`${prefix}-content`}>
        <textarea
          id={`${prefix}-content`}
          rows={8}
          value={draft.content}
          maxLength={KNOWLEDGE_LIMITS.content}
          onChange={(e) => set("content", e.target.value)}
          className={inputClass}
        />
        <Counter value={draft.content} max={KNOWLEDGE_LIMITS.content} />
      </Field>
      <Field
        label="Mots-clés"
        hint="Séparés par des virgules. Si l'un d'eux apparaît dans une question, la fiche est envoyée en priorité."
        htmlFor={`${prefix}-keywords`}
      >
        <input
          id={`${prefix}-keywords`}
          value={draft.keywords}
          placeholder="Ex. : carte d'identité, CNI, mairie, passeport"
          onChange={(e) => set("keywords", e.target.value)}
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.isActive} onChange={(e) => set("isActive", e.target.checked)} />
        Active (utilisée par Awa)
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButton}>
          {pending ? "Enregistrement…" : draft.id ? "Enregistrer" : "Ajouter la fiche"}
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

export function KnowledgeEditor({ rows }: { rows: KnowledgeRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const active = rows.filter((r) => r.isActive).length;
  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) => `${r.title} ${r.content} ${r.keywords.join(" ")}`.toLowerCase().includes(q))
    : rows;

  return (
    <div className="max-w-4xl space-y-4">
      {openId === "new" ? (
        <AdminCard title="Nouvelle fiche">
          <EntryForm initial={EMPTY} onClose={() => setOpenId(null)} />
        </AdminCard>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setOpenId("new")} className={`${primaryButton} inline-flex items-center gap-1.5`}>
            <IconPlus width={16} height={16} /> Nouvelle fiche
          </button>
          <span className="text-sm text-fg-muted">
            {rows.length} fiche{rows.length > 1 ? "s" : ""} · {active} active{active > 1 ? "s" : ""}
          </span>
          {rows.length > 5 ? (
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              aria-label="Rechercher une fiche"
              className={`${inputClass} ml-auto max-w-xs`}
            />
          ) : null}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-bg p-6 text-center text-sm text-fg-muted">
          Aucune fiche pour l&apos;instant. Ajoutez ce qu&apos;Awa doit savoir avec certitude.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((row) => (
            <li key={row.id} className="rounded-xl border border-border bg-bg">
              {openId === row.id ? (
                <div className="p-5">
                  <EntryForm initial={toDraft(row)} onClose={() => setOpenId(null)} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setOpenId(row.id)}
                  className="flex w-full items-start gap-3 rounded-xl p-4 text-left hover:bg-bg-muted"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium">{row.title}</span>
                      {!row.isActive ? (
                        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px] text-fg-muted">
                          désactivée
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-fg-muted">{row.content}</span>
                    {row.keywords.length ? (
                      <span className="mt-1.5 flex flex-wrap gap-1">
                        {row.keywords.map((k) => (
                          <span key={k} className="rounded-full bg-bg-muted px-2 py-0.5 text-[11px]">
                            {k}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-accent">Modifier</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

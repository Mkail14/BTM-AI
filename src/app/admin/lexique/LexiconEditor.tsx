"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconClose, IconLanguage, IconPlus, IconTrash } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import { deleteLexiconAction, saveLexiconAction } from "./actions";
import { LEXICON_LIMITS, type LexiconRow } from "./limits";

type Draft = Omit<LexiconRow, "id" | "validatedAt"> & { id: string | null };

const EMPTY: Draft = { id: null, french: "", shimaore: "", context: "", validatedBy: "", isActive: true };

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });

/** Fenêtre d'ajout ou de modification d'une expression, sur la page floutée. */
function EntryDialog({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus(null);
  };
  const complete = draft.french.trim() && draft.shimaore.trim() && draft.validatedBy.trim();

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("input")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
      if (result.ok) {
        router.refresh();
        onClose();
      }
    });
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lexicon-title"
        className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-bg shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <IconLanguage width={20} height={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="lexicon-title" className="text-lg leading-tight font-semibold">
              {draft.id ? "Modifier l'expression" : "Nouvelle expression"}
            </h2>
            <p className="mt-0.5 text-sm text-fg-muted">Une traduction relue par un locuteur du shimaoré.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-2 text-fg-muted hover:bg-bg-muted hover:text-fg"
          >
            <IconClose />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-4 p-5">
            {/* La traduction : français → shimaoré */}
            <div className="overflow-hidden rounded-xl border border-border bg-bg-subtle focus-within:border-accent">
              <label htmlFor="lexicon-fr" className="block px-3.5 pt-2.5 text-xs font-medium text-fg-muted">
                Français
              </label>
              <input
                id="lexicon-fr"
                value={draft.french}
                maxLength={LEXICON_LIMITS.phrase}
                placeholder="Ex. : Bonjour, comment ça va ?"
                onChange={(e) => set("french", e.target.value)}
                className="w-full bg-transparent px-3.5 pt-1 pb-3 text-[15px] outline-none"
              />
              <div className="border-t border-border bg-bg">
                <label htmlFor="lexicon-sh" className="block px-3.5 pt-2.5 text-xs font-medium text-accent">
                  Shimaoré
                </label>
                <input
                  id="lexicon-sh"
                  value={draft.shimaore}
                  maxLength={LEXICON_LIMITS.phrase}
                  placeholder="Ex. : Jéjé, habari ?"
                  onChange={(e) => set("shimaore", e.target.value)}
                  className="w-full bg-transparent px-3.5 pt-1 pb-3 text-[15px] font-medium outline-none"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="lexicon-ctx" className="text-sm font-medium">
                  Contexte <span className="font-normal text-fg-muted">(facultatif)</span>
                </label>
                <input
                  id="lexicon-ctx"
                  value={draft.context}
                  maxLength={LEXICON_LIMITS.context}
                  placeholder="Salutation, commerce…"
                  onChange={(e) => set("context", e.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </div>
              <div>
                <label htmlFor="lexicon-by" className="text-sm font-medium">
                  Validé par
                </label>
                <input
                  id="lexicon-by"
                  value={draft.validatedBy}
                  maxLength={LEXICON_LIMITS.validatedBy}
                  placeholder="Nom du locuteur"
                  onChange={(e) => set("validatedBy", e.target.value)}
                  className={`${inputClass} mt-1.5`}
                />
              </div>
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-2.5">
              <span>
                <span className="block text-sm font-medium">Active</span>
                <span className="block text-xs text-fg-muted">Awa s&apos;en sert comme exemple quand elle parle shimaoré.</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={draft.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="relative h-6 w-11 shrink-0 rounded-full bg-bg-muted transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-bg after:shadow-sm after:transition-transform peer-checked:after:translate-x-5"
              />
            </label>

            {status && !status.ok ? (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm">
                {status.message}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2 border-t border-border bg-bg-subtle px-5 py-3">
            {draft.id ? (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
              >
                <IconTrash width={15} height={15} />
                Supprimer
              </button>
            ) : null}
            <span className="flex-1" />
            <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
              Annuler
            </button>
            <button type="submit" disabled={pending || !complete} className={primaryButton}>
              {pending ? "Enregistrement…" : draft.id ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

export function LexiconEditor({ rows }: { rows: LexiconRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const active = rows.filter((r) => r.isActive).length;
  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => `${r.french} ${r.shimaore} ${r.context}`.toLowerCase().includes(q)) : rows;
  const opened = openId === "new" ? EMPTY : rows.find((r) => r.id === openId);
  // Stable : la fenêtre ne doit pas reprendre le focus à chaque frappe.
  const close = useCallback(() => setOpenId(null), []);

  return (
    <div className="max-w-4xl space-y-4">
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

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-bg p-6 text-center text-sm text-fg-muted">
          Aucune expression pour l&apos;instant. Ajoutez des traductions relues par un locuteur.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((row) => (
            <li key={row.id} className="rounded-xl border border-border bg-bg">
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
            </li>
          ))}
        </ul>
      )}

      {opened ? <EntryDialog key={openId} initial={{ ...opened }} onClose={close} /> : null}
    </div>
  );
}

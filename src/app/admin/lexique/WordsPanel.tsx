"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconBook, IconClose, IconPlus, IconTrash } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import { deleteWordAction, saveWordAction } from "./actions";
import { WORD_LIMITS, type WordRow } from "./limits";

type Draft = Omit<WordRow, "id"> & { id: string | null };

const EMPTY: Draft = { id: null, french: "", shimaore: "", category: "", isActive: true };

/**
 * Fenêtre d'ajout ou de modification d'un mot, sur la page floutée.
 * En ajout, elle reste ouverte après chaque mot pour enchaîner la saisie.
 */
function WordDialog({
  initial,
  categories,
  onClose,
}: {
  initial: Draft;
  categories: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const frenchRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(initial);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [added, setAdded] = useState(0);
  const [pending, startTransition] = useTransition();
  const editing = draft.id !== null;
  const complete = draft.french.trim() && draft.shimaore.trim();

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setStatus(null);
  };

  useEffect(() => {
    frenchRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function save() {
    startTransition(async () => {
      const result = await saveWordAction(draft);
      setStatus(result);
      if (!result.ok) return;
      router.refresh();
      if (editing) {
        onClose();
      } else {
        // Garde la catégorie : on ajoute souvent plusieurs mots du même thème.
        setDraft({ ...EMPTY, category: draft.category });
        setAdded((n) => n + 1);
        frenchRef.current?.focus();
      }
    });
  }

  function remove() {
    if (!draft.id || !window.confirm(`Supprimer « ${initial.french} → ${initial.shimaore} » ?`)) return;
    startTransition(async () => {
      const result = await deleteWordAction(draft.id);
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
        role="dialog"
        aria-modal="true"
        aria-labelledby="word-title"
        className="fixed top-1/2 left-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-bg shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <IconBook width={20} height={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="word-title" className="text-lg leading-tight font-semibold">
              {editing ? "Modifier le mot" : "Ajouter un mot"}
            </h2>
            <p className="mt-0.5 text-sm text-fg-muted">
              {editing ? "Awa l'utilise dès l'enregistrement." : "Entrée pour ajouter, puis le suivant."}
            </p>
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
            if (complete && !pending) save();
          }}
        >
          <div className="space-y-4 p-5">
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <div>
                <label htmlFor="word-fr" className="text-xs font-medium text-fg-muted">
                  Français
                </label>
                <input
                  ref={frenchRef}
                  id="word-fr"
                  value={draft.french}
                  maxLength={WORD_LIMITS.word}
                  placeholder="Ex. : maison"
                  autoComplete="off"
                  onChange={(e) => set("french", e.target.value)}
                  className={`${inputClass} mt-1.5 text-[15px]`}
                />
              </div>
              <span aria-hidden="true" className="hidden pb-2.5 text-lg text-fg-muted sm:block">
                →
              </span>
              <div>
                <label htmlFor="word-sh" className="text-xs font-medium text-accent">
                  Shimaoré
                </label>
                <input
                  id="word-sh"
                  value={draft.shimaore}
                  maxLength={WORD_LIMITS.word}
                  placeholder="Ex. : nyumba"
                  autoComplete="off"
                  onChange={(e) => set("shimaore", e.target.value)}
                  className={`${inputClass} mt-1.5 text-[15px] font-medium`}
                />
              </div>
            </div>

            <div>
              <label htmlFor="word-cat" className="text-sm font-medium">
                Catégorie <span className="font-normal text-fg-muted">(facultatif)</span>
              </label>
              <input
                id="word-cat"
                list="word-categories"
                value={draft.category}
                maxLength={WORD_LIMITS.category}
                placeholder="Nom, verbe, nombre, famille…"
                autoComplete="off"
                onChange={(e) => set("category", e.target.value)}
                className={`${inputClass} mt-1.5`}
              />
              <datalist id="word-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            {editing ? (
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-2.5">
                <span>
                  <span className="block text-sm font-medium">Actif</span>
                  <span className="block text-xs text-fg-muted">Awa connaît ce mot.</span>
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
            ) : null}

            {status ? (
              <p
                role={status.ok ? "status" : "alert"}
                className={`rounded-lg px-3 py-2 text-sm ${status.ok ? "bg-success-soft" : "bg-danger-soft"}`}
              >
                {status.ok ? "✓ " : ""}
                {status.message}
              </p>
            ) : null}
          </div>

          <div className="flex items-center gap-2 border-t border-border bg-bg-subtle px-5 py-3">
            {editing ? (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-danger hover:bg-danger-soft disabled:opacity-60"
              >
                <IconTrash width={15} height={15} />
                Supprimer
              </button>
            ) : added > 0 ? (
              <span className="text-sm text-fg-muted">
                {added} mot{added > 1 ? "s" : ""} ajouté{added > 1 ? "s" : ""}
              </span>
            ) : null}
            <span className="flex-1" />
            <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
              {editing || added === 0 ? "Annuler" : "Terminer"}
            </button>
            <button type="submit" disabled={pending || !complete} className={primaryButton}>
              {pending ? "Enregistrement…" : editing ? "Enregistrer" : "Ajouter"}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

/** Dictionnaire de mots français ↔ shimaoré, à droite des expressions. */
export function WordsPanel({ rows, unavailable }: { rows: WordRow[]; unavailable: boolean }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const close = useCallback(() => setOpenId(null), []);

  const q = query.trim().toLowerCase();
  const shown = q ? rows.filter((r) => `${r.french} ${r.shimaore} ${r.category}`.toLowerCase().includes(q)) : rows;
  const categories = [...new Set(rows.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
  const opened = openId === "new" ? EMPTY : rows.find((r) => r.id === openId);

  return (
    <>
    <section
      aria-labelledby="words-title"
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-bg lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)]"
    >
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
          <IconBook width={18} height={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="words-title" className="font-semibold">
            Dictionnaire
          </h2>
          <p className="text-xs text-fg-muted">
            {rows.length} mot{rows.length > 1 ? "s" : ""} · Awa reçoit ceux du message
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpenId("new")}
          disabled={unavailable}
          className={`${primaryButton} inline-flex shrink-0 items-center gap-1.5 px-3`}
        >
          <IconPlus width={16} height={16} /> Ajouter un mot
        </button>
      </div>

      {unavailable ? (
        <p role="alert" className="m-4 rounded-lg bg-warning-soft px-3 py-2 text-sm">
          Appliquez la migration <code className="font-mono">20261103000000_awa_words.sql</code> dans Supabase pour activer
          le dictionnaire.
        </p>
      ) : rows.length === 0 ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          <div>
            <p className="font-medium">Aucun mot pour l&apos;instant</p>
            <p className="mt-1 text-sm text-fg-muted">Ajoutez des mots un par un : Awa les apprend aussitôt.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="border-b border-border p-3">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un mot…"
              aria-label="Rechercher un mot"
              className={inputClass}
            />
          </div>
          <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto overscroll-contain">
            {shown.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(row.id)}
                  className={`grid w-full grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-bg-muted ${
                    row.isActive ? "" : "opacity-50"
                  }`}
                >
                  <span className="min-w-0 truncate">{row.french}</span>
                  <span aria-hidden="true" className="text-fg-muted">
                    →
                  </span>
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate font-medium text-accent">{row.shimaore}</span>
                    {row.category ? (
                      <span className="shrink-0 rounded-full bg-bg-muted px-2 py-0.5 text-[11px] text-fg-muted">{row.category}</span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
            {shown.length === 0 ? <li className="px-4 py-6 text-center text-sm text-fg-muted">Aucun mot trouvé.</li> : null}
          </ul>
        </>
      )}
    </section>
    {/* Hors du panneau « sticky » : la fenêtre doit couvrir toute la page, en-tête compris. */}
    {opened ? <WordDialog key={openId} initial={{ ...opened }} categories={categories} onClose={close} /> : null}
    </>
  );
}

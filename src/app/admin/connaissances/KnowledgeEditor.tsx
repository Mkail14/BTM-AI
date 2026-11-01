"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ActionStatus, Counter, inputClass, primaryButton, secondaryButton } from "@/components/admin/form";
import { IconPlus } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";
import { deleteKnowledgeAction, saveKnowledgeAction } from "./actions";
import { KNOWLEDGE_LIMITS, type KnowledgeRow } from "./limits";

type Draft = { id: string | null; title: string; content: string; keywords: string; isActive: boolean };

const EMPTY: Draft = { id: null, title: "", content: "", keywords: "", isActive: true };

const toDraft = (row: KnowledgeRow): Draft => ({ ...row, keywords: row.keywords.join(", ") });
const splitKeywords = (value: string) => value.split(",").map((k) => k.trim()).filter(Boolean);

const label = "block text-[13px] font-medium text-fg-muted";

/**
 * Fiche ouverte dans une fenêtre au-dessus de la page (fond flouté) : rendue
 * directement dans <body>, elle couvre tout, en-tête compris, et la page
 * derrière ne bouge ni ne défile. Échap ou un clic sur le fond ferme.
 */
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
  const keywords = splitKeywords(draft.keywords);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("input")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    // La page derrière ne défile pas tant que la fenêtre est ouverte.
    const overflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = overflow;
    };
  }, [onClose]);

  function save() {
    startTransition(async () => {
      const result = await saveKnowledgeAction({ ...draft, keywords });
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
      if (result.ok) {
        router.refresh();
        onClose();
      }
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden p-4">
      <div className="fenetre-fond absolute inset-0 bg-black/30 backdrop-blur-md" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fiche-titre"
        className="fenetre relative flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-bg shadow-2xl"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="flex items-center justify-between gap-3 px-6 pt-5">
            <h2 id="fiche-titre" className="text-lg font-semibold">
              {draft.id ? "Modifier la fiche" : "Nouvelle fiche"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fermer"
              className="grid size-8 place-items-center rounded-full bg-bg-muted text-fg-muted transition hover:text-fg"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-6 py-5">
            <input
              value={draft.title}
              maxLength={KNOWLEDGE_LIMITS.title}
              placeholder="Titre, ex. : Refaire sa carte d'identité à Mayotte"
              aria-label="Titre"
              onChange={(e) => set("title", e.target.value)}
              className="w-full border-0 bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-fg-muted/50"
            />

            <div>
              <label htmlFor="fiche-contenu" className={label}>
                Ce qu&apos;Awa doit savoir
              </label>
              <textarea
                id="fiche-contenu"
                rows={9}
                value={draft.content}
                maxLength={KNOWLEDGE_LIMITS.content}
                placeholder="Les informations vérifiées, telles qu'Awa doit les donner."
                onChange={(e) => set("content", e.target.value)}
                className={`${inputClass} mt-2 resize-none rounded-2xl bg-bg-subtle`}
              />
              <Counter value={draft.content} max={KNOWLEDGE_LIMITS.content} />
            </div>

            <div>
              <label htmlFor="fiche-mots" className={label}>
                Mots-clés <span className="font-normal">· séparés par des virgules</span>
              </label>
              <input
                id="fiche-mots"
                value={draft.keywords}
                placeholder="carte d'identité, CNI, mairie, passeport"
                onChange={(e) => set("keywords", e.target.value)}
                className={`${inputClass} mt-2 rounded-2xl bg-bg-subtle`}
              />
              {keywords.length ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {keywords.map((k) => (
                    <span key={k} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                      {k}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-fg-muted">Si l&apos;un d&apos;eux est dans une question, Awa reçoit la fiche.</p>
              )}
            </div>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-bg-subtle px-4 py-3">
              <span>
                <span className="block text-sm font-medium">Active</span>
                <span className="block text-xs text-fg-muted">Awa utilise cette fiche</span>
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
                className="relative h-6 w-10 shrink-0 rounded-full bg-border transition peer-checked:bg-success peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-4">
            {draft.id ? (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
              >
                Supprimer
              </button>
            ) : null}
            <ActionStatus result={status} />
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={onClose} disabled={pending} className={secondaryButton}>
                Annuler
              </button>
              <button type="submit" disabled={pending || !draft.title.trim() || !draft.content.trim()} className={primaryButton}>
                {pending ? "Enregistrement…" : draft.id ? "Enregistrer" : "Ajouter la fiche"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

/** Fiches en cartes, dans un panneau qui défile seul ; la fiche s'ouvre en fenêtre. */
export function KnowledgeEditor({ rows }: { rows: KnowledgeRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const close = useCallback(() => setOpenId(null), []);
  const active = rows.filter((r) => r.isActive).length;
  const q = query.trim().toLowerCase();
  const shown = q
    ? rows.filter((r) => `${r.title} ${r.content} ${r.keywords.join(" ")}`.toLowerCase().includes(q))
    : rows;
  const openRow = rows.find((r) => r.id === openId);
  const opened: Draft | null = openId === "new" ? EMPTY : openRow ? toDraft(openRow) : null;

  return (
    <section aria-labelledby="fiches" className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-border bg-bg">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
        <div className="mr-auto">
          <h2 id="fiches" className="font-semibold">
            Fiches vérifiées
          </h2>
          <p className="text-xs text-fg-muted">
            {rows.length} fiche{rows.length > 1 ? "s" : ""} · {active} active{active > 1 ? "s" : ""}
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher…"
          aria-label="Rechercher une fiche"
          className={`${inputClass} w-full rounded-full bg-bg-subtle sm:w-56`}
        />
        <button type="button" onClick={() => setOpenId("new")} className={`${primaryButton} inline-flex items-center gap-1.5 rounded-full`}>
          <IconPlus width={16} height={16} /> Nouvelle fiche
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {shown.length ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {shown.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(row.id)}
                  className="group flex h-full w-full flex-col rounded-2xl border border-border bg-bg-subtle p-4 text-left transition hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg"
                >
                  <span className="flex items-start gap-2">
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 size-2 shrink-0 rounded-full ${row.isActive ? "bg-success" : "bg-border"}`}
                    />
                    <span className="line-clamp-2 flex-1 font-medium">{row.title}</span>
                  </span>
                  <span className="mt-1.5 line-clamp-3 text-sm text-fg-muted">{row.content}</span>
                  {row.keywords.length ? (
                    <span className="mt-auto flex flex-wrap gap-1 pt-3">
                      {row.keywords.slice(0, 4).map((k) => (
                        <span key={k} className="rounded-full bg-bg px-2 py-0.5 text-[11px] text-fg-muted">
                          {k}
                        </span>
                      ))}
                      {row.keywords.length > 4 ? (
                        <span className="px-1 py-0.5 text-[11px] text-fg-muted">+{row.keywords.length - 4}</span>
                      ) : null}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="grid h-full place-items-center p-8 text-center">
            <div>
              <p className="font-medium">{rows.length ? "Aucune fiche ne correspond." : "Aucune fiche pour l'instant."}</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-fg-muted">
                Une fiche = une information sûre (démarche, lieu, horaire, BTM…). Awa la reçoit quand un de ses mots-clés est
                dans la question.
              </p>
            </div>
          </div>
        )}
      </div>

      {opened ? <EntryDialog key={openId} initial={opened} onClose={close} /> : null}
    </section>
  );
}

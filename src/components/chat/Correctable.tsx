"use client";

import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/admin/action-auth";

export type Correction = { wrote: string; shimaore: string; french: string; context: string };

/** Fourni par le chat au maître d'Awa : enregistre la correction d'un passage d'une réponse. */
export const CorrectContext = createContext<((messageId: string, correction: Correction) => Promise<ActionResult>) | null>(null);

const MAX = 200;
const CONTEXT_MAX = 120;
const inputClass =
  "w-full rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-60";

type Anchor = { top: number; left: number };

/** Place la fenêtre sous la sélection, sans dépasser de l'écran. */
function anchorFor(rect: DOMRect): Anchor {
  const width = Math.min(320, window.innerWidth - 32);
  return {
    top: Math.min(rect.bottom + 8, window.innerHeight - 340),
    left: Math.max(16, Math.min(rect.left, window.innerWidth - width - 16)),
  };
}

/**
 * Réponse d'Awa que son maître peut corriger : il sélectionne un mot ou un
 * passage (même connu), un bouton « Corriger » apparaît, il donne la bonne
 * façon de le dire, son sens et, si besoin, le contexte où elle s'emploie.
 */
export function Correctable({ messageId, children }: { messageId: string; children: ReactNode }) {
  const correct = use(CorrectContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ text: string; anchor: Anchor } | null>(null);
  const [form, setForm] = useState<(Correction & { anchor: Anchor }) | null>(null);
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [saving, setSaving] = useState(false);

  // Sélection dans cette réponse : bouton « Corriger » juste en dessous.
  useEffect(() => {
    if (!correct) return;
    const onSelectionChange = () => {
      const sel = window.getSelection();
      const text = sel?.toString().replace(/\s+/g, " ").trim() ?? "";
      const root = rootRef.current;
      if (!sel || sel.rangeCount === 0 || !text || !root || !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) {
        setSelection(null);
        return;
      }
      setSelection({ text: text.slice(0, MAX), anchor: anchorFor(sel.getRangeAt(0).getBoundingClientRect()) });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, [correct]);

  // Clic en dehors ou Échap : la fenêtre se ferme.
  useEffect(() => {
    if (!form) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setForm(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setForm(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [form]);

  if (!correct) return <>{children}</>;

  function open(text: string, anchor: Anchor) {
    setForm({ wrote: text, shimaore: text, french: "", context: "", anchor });
    setStatus(null);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  async function save() {
    if (!form || !correct || saving) return;
    setSaving(true);
    const result = await correct(messageId, form);
    setSaving(false);
    setStatus(result);
    if (result.ok) setTimeout(() => setForm(null), 1200);
  }

  const set = (key: "shimaore" | "french" | "context", value: string) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setStatus(null);
  };

  return (
    <div ref={rootRef} className="group/correct relative">
      {children}

      {/* Sans sélection (téléphone, découverte) : le crayon ouvre la fenêtre, passage à recopier. */}
      <button
        type="button"
        onClick={(e) => open("", anchorFor(e.currentTarget.getBoundingClientRect()))}
        title="Corriger un mot ou une phrase de cette réponse (ou sélectionnez le passage)"
        className="mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-fg-muted opacity-60 hover:bg-bg-muted hover:text-fg hover:opacity-100 focus-visible:opacity-100 sm:opacity-0 sm:group-hover/correct:opacity-60"
      >
        <span aria-hidden="true">✏️</span> Corriger
      </button>

      {selection && !form ? (
        <button
          type="button"
          // Garde la sélection au clic (sinon elle disparaît avant onClick).
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => open(selection.text, selection.anchor)}
          style={{ top: selection.anchor.top, left: selection.anchor.left }}
          className="fixed z-30 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg shadow-lg hover:bg-accent-hover"
        >
          <span aria-hidden="true">✏️</span> Corriger « {selection.text.length > 24 ? `${selection.text.slice(0, 24)}…` : selection.text} »
        </button>
      ) : null}

      {form ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Corriger Awa"
          style={{ top: form.anchor.top, left: form.anchor.left }}
          className="fixed z-30 w-[min(20rem,calc(100vw-2rem))] space-y-2 rounded-xl border border-border bg-bg p-3 text-sm shadow-xl"
        >
          <p className="text-xs text-fg-muted">
            {form.wrote ? (
              <>
                Awa a écrit : <span className="font-medium text-fg">« {form.wrote} »</span>
              </>
            ) : (
              "Corrigez un mot ou une phrase de cette réponse."
            )}
          </p>
          <label className="block">
            <span className="text-xs font-medium text-accent">Il fallait dire (shimaoré)</span>
            <input
              autoFocus
              value={form.shimaore}
              maxLength={MAX}
              disabled={saving}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => set("shimaore", e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium">Ça veut dire (français)</span>
            <input
              value={form.french}
              maxLength={MAX}
              disabled={saving}
              autoComplete="off"
              onChange={(e) => set("french", e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium">Dans quel contexte ? (facultatif)</span>
            <input
              value={form.context}
              maxLength={CONTEXT_MAX}
              disabled={saving}
              autoComplete="off"
              placeholder="ex. : à un aîné, au marché, entre amis…"
              onChange={(e) => set("context", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) void save();
              }}
              className={`${inputClass} mt-1`}
            />
            <span className="mt-0.5 block text-[11px] text-fg-muted">
              Vide : la correction remplace la traduction partout. Rempli : elle s&apos;ajoute pour cette situation.
            </span>
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            {status ? (
              <span role="status" className={`mr-auto min-w-0 truncate text-xs ${status.ok ? "text-success" : "text-danger"}`} title={status.message}>
                {status.ok ? "✓ " : ""}
                {status.message}
              </span>
            ) : null}
            <button type="button" onClick={() => setForm(null)} className="rounded-lg px-2.5 py-1.5 text-xs text-fg-muted hover:bg-bg-muted">
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !form.shimaore.trim() || !form.french.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "…" : "Retenir"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

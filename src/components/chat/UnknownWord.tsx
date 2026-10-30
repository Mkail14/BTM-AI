"use client";

import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import type { ActionResult } from "@/lib/admin/action-auth";

/** Fourni par le chat au maître d'Awa : enregistre la traduction d'un [[mot]]. */
export const TeachWordContext = createContext<((french: string, shimaore: string) => Promise<ActionResult>) | null>(null);

const markClass = "rounded bg-amber-400/20 px-1 font-medium text-amber-700 dark:text-amber-300";

/**
 * Mot qu'Awa ne connaît pas encore en shimaoré. Pour son maître, un clic ouvre
 * une petite case sur place : il écrit la traduction, Entrée, c'est retenu.
 */
export function UnknownWord({ french, children }: { french: string; children: ReactNode }) {
  const teach = use(TeachWordContext);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  // Clic en dehors : la case se ferme.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!teach) {
    return (
      <mark title="Mot à lui apprendre en shimaoré" className={markClass}>
        {children}
      </mark>
    );
  }

  async function save() {
    const shimaore = value.trim();
    if (!shimaore || saving || !teach) return;
    setSaving(true);
    setError(null);
    const result = await teach(french, shimaore);
    setSaving(false);
    // Réussi : le chat remplace le mot partout, ce composant disparaît.
    if (!result.ok) setError(result.message);
  }

  return (
    <span ref={rootRef} className="relative inline">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Donner la traduction en shimaoré"
        className={`${markClass} cursor-pointer underline decoration-amber-500/60 decoration-dotted underline-offset-4 hover:bg-amber-400/35`}
      >
        {children}
      </button>
      {open ? (
        <span className="absolute top-full left-0 z-20 mt-1.5 block w-64 rounded-xl border border-border bg-bg p-2 shadow-xl">
          <span className="block px-1 pb-1.5 text-xs text-fg-muted">
            « {french} » en shimaoré :
          </span>
          {/* Pas de <form> : la case est dans un paragraphe (HTML invalide). Entrée valide. */}
          <span className="flex gap-1.5">
            <input
              autoFocus
              value={value}
              maxLength={200}
              disabled={saving}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setOpen(false);
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void save();
                }
              }}
              className="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !value.trim()}
              className="rounded-lg bg-accent px-3 text-sm font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-50"
            >
              {saving ? "…" : "OK"}
            </button>
          </span>
          {error ? <span className="block px-1 pt-1.5 text-xs text-danger">{error}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

"use client";

import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { guessFrenchAction } from "@/app/(chat)/actions";
import { IconCheck, IconClose, IconPencil } from "@/components/ui/icons";
import type { ActionResult } from "@/lib/admin/action-auth";

export type Correction = { wrote: string; shimaore: string; french: string; context: string };

/** Fourni par le chat au maître de Tamilya : enregistre la correction d'un passage d'une réponse. */
export const CorrectContext = createContext<((messageId: string, correction: Correction) => Promise<ActionResult>) | null>(null);

const MAX = 200;
const CONTEXT_MAX = 120;

/* Couleurs du thème : la fenêtre suit le mode clair ou sombre du site. */
const inputClass =
  "mt-1.5 w-full rounded-xl border border-border bg-bg/70 px-3.5 py-2.5 text-[15px] text-fg shadow-sm outline-none transition placeholder:text-fg-muted/70 focus:border-accent focus:bg-bg focus:ring-4 focus:ring-accent/15 disabled:opacity-60";
const labelClass = "text-xs font-semibold tracking-wide text-fg-muted uppercase";

/** Effet verre : fond du site translucide et flou de ce qu'il y a derrière. */
const glassClass =
  "border border-border/70 bg-bg/70 text-fg shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl backdrop-saturate-150";

/** Où placer le bouton « Corriger » : centré sous la sélection, à 16 px au moins des bords. */
type Anchor = { top: number; center: number };

function anchorFor(rect: DOMRect): Anchor {
  return {
    top: Math.min(rect.bottom + 10, window.innerHeight - 56),
    // Les deux boutons font au plus ~22rem.
    center: Math.max(184, Math.min(rect.left + rect.width / 2, window.innerWidth - 184)),
  };
}

/**
 * La réponse en texte simple, pour « C'est juste » sur toute la réponse : vide
 * si elle est trop longue ou s'il y reste du français ([[…]]) ; le maître
 * sélectionne alors la phrase juste.
 */
function plainReply(reply: string): string {
  const text = reply
    .replace(/```[\s\S]*?(?:```|$)/g, "")
    .replace(/[*_#>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.includes("[[") || text.length > MAX ? "" : text;
}

/** Corriger un passage faux, ou garder comme modèle une phrase juste. */
type Mode = "correct" | "approve";

/**
 * Réponse de Tamilya que son maître peut corriger : il sélectionne un mot ou un
 * passage (même connu), un bouton « Corriger » apparaît, il donne la bonne
 * façon de le dire, son sens et, si besoin, le contexte où elle s'emploie.
 */
export function Correctable({
  messageId,
  reply,
  question,
  children,
}: {
  messageId: string;
  /** Réponse complète de Tamilya et message auquel elle répond : pour retrouver ce qu'elle voulait dire. */
  reply: string;
  question?: string;
  children: ReactNode;
}) {
  const correct = use(CorrectContext);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ text: string; anchor: Anchor } | null>(null);
  const [form, setForm] = useState<Correction | null>(null);
  const [mode, setMode] = useState<Mode>("correct");
  const [status, setStatus] = useState<ActionResult | null>(null);
  const [saving, setSaving] = useState(false);
  // Ce que Tamilya voulait dire en français : montré avant de corriger.
  const [meaning, setMeaning] = useState<
    { state: "loading" } | { state: "done"; french: string; fromLexicon: boolean } | { state: "error"; message: string } | null
  >(null);
  const meaningRequest = useRef(0);

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

  // Clic sur le fond flouté ou Échap : la fenêtre se ferme. La page ne défile pas derrière.
  useEffect(() => {
    if (!form) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) setForm(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setForm(null);
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [form]);

  if (!correct) return <>{children}</>;

  function open(text: string, nextMode: Mode = "correct") {
    setMode(nextMode);
    setForm({ wrote: text, shimaore: text, french: "", context: "" });
    setStatus(null);
    // Une traduction encore en route pour une fenêtre précédente est ignorée.
    meaningRequest.current++;
    setMeaning(null);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
    if (text) void explain(text);
  }

  /** Traduit en français ce que Tamilya a écrit ; remplit le champ « Ça veut dire » s'il est vide. */
  async function explain(text: string) {
    const request = ++meaningRequest.current;
    setMeaning({ state: "loading" });
    const result = await guessFrenchAction({
      shimaore: text,
      wrote: text,
      message: reply.slice(0, 2000),
      question: (question ?? "").slice(0, 1000),
    }).catch(() => ({ ok: false as const, message: "Sens introuvable : écrivez-le vous-même." }));
    if (request !== meaningRequest.current) return;
    if (!result.ok) {
      setMeaning({ state: "error", message: result.message });
      return;
    }
    setMeaning({ state: "done", french: result.french, fromLexicon: result.fromLexicon });
    setForm((f) => (f && !f.french.trim() ? { ...f, french: result.french } : f));
  }

  async function save() {
    if (!form || !correct || saving) return;
    setSaving(true);
    // « C'est juste » : rien à remplacer dans la réponse affichée.
    const result = await correct(messageId, mode === "approve" ? { ...form, wrote: "" } : form);
    setSaving(false);
    setStatus(result);
    if (result.ok) setTimeout(() => setForm(null), 1200);
  }

  const set = (key: keyof Correction, value: string) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setStatus(null);
  };

  return (
    <div ref={rootRef} className="group/correct relative">
      {children}

      {/* Sans sélection (téléphone, découverte) : « C'est juste » garde la réponse entière, le crayon ouvre la correction. */}
      <div className="mt-2 flex flex-wrap gap-1.5 opacity-80 transition focus-within:opacity-100 sm:opacity-0 sm:group-hover/correct:opacity-80 sm:focus-within:opacity-100">
        <button
          type="button"
          onClick={() => open(plainReply(reply), "approve")}
          title="Tamilya a bien parlé : garder cette réponse (ou la phrase sélectionnée) comme modèle"
          className={`${glassClass} inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition hover:-translate-y-px hover:bg-bg-muted`}
        >
          <IconCheck width={13} height={13} /> C&apos;est juste
        </button>
        <button
          type="button"
          onClick={() => open("")}
          title="Corriger un mot ou une phrase de cette réponse (ou sélectionnez le passage)"
          className={`${glassClass} inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition hover:-translate-y-px hover:bg-bg-muted`}
        >
          <IconPencil width={13} height={13} /> Corriger
        </button>
      </div>

      {selection && !form ? (
        <div
          // Garde la sélection au clic (sinon elle disparaît avant onClick).
          onPointerDown={(e) => e.preventDefault()}
          style={{ top: selection.anchor.top, left: selection.anchor.center }}
          className={`${glassClass} fixed z-30 flex max-w-[22rem] -translate-x-1/2 animate-[correct-in_160ms_ease-out] items-center gap-1 rounded-full p-1 text-sm font-medium`}
        >
          <button
            type="button"
            onClick={() => open(selection.text, "approve")}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full py-1 pr-3 pl-1 transition-colors hover:bg-bg-muted"
          >
            <span className="grid size-7 place-items-center rounded-full bg-success text-white">
              <IconCheck width={14} height={14} />
            </span>
            C&apos;est juste
          </button>
          <button
            type="button"
            onClick={() => open(selection.text)}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full py-1 pr-3 pl-1 transition-colors hover:bg-bg-muted"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-fg">
              <IconPencil width={14} height={14} />
            </span>
            <span className="truncate">
              Corriger <span className="text-fg-muted">« {selection.text.length > 16 ? `${selection.text.slice(0, 16)}…` : selection.text} »</span>
            </span>
          </button>
        </div>
      ) : null}

      {/* Dans <body> : aucun parent (transform, flou…) ne peut décaler la fenêtre. */}
      {form
        ? createPortal(
            <div className="fixed inset-0 z-50 grid animate-[correct-fade_200ms_ease-out] place-items-center overflow-y-auto bg-bg/50 p-4 backdrop-blur-md">
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="correct-title"
                className="w-full max-w-md animate-[correct-in_220ms_cubic-bezier(0.2,0.9,0.3,1.2)] rounded-3xl border border-border bg-bg-subtle/85 p-6 text-fg shadow-[0_24px_80px_-12px_rgb(0,0,0,0.35)] backdrop-blur-2xl backdrop-saturate-150"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`grid size-10 shrink-0 place-items-center rounded-2xl shadow-sm ${mode === "approve" ? "bg-success text-white" : "bg-accent text-accent-fg"}`}
                  >
                    {mode === "approve" ? <IconCheck width={18} height={18} /> : <IconPencil width={18} height={18} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 id="correct-title" className="text-lg leading-tight font-semibold">
                      {mode === "approve" ? "C'est juste" : "Corriger Tamilya"}
                    </h2>
                    <p className="mt-0.5 text-sm text-fg-muted">
                      {mode === "approve"
                        ? "Tamilya gardera cette phrase comme modèle pour parler."
                        : "Apprenez-lui la bonne façon de le dire."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    aria-label="Fermer"
                    className="-mt-1 -mr-2 rounded-full p-2 text-fg-muted transition hover:bg-bg-muted hover:text-fg"
                  >
                    <IconClose width={18} height={18} />
                  </button>
                </div>

                {meaning && mode === "correct" ? (
                  <div role="status" className="mt-5 rounded-2xl border border-accent/25 bg-accent-soft/60 px-4 py-3">
                    <p className={`${labelClass} text-accent`}>Tamilya voulait dire</p>
                    {meaning.state === "loading" ? (
                      <p className="mt-1.5 animate-pulse text-sm text-fg-muted">Traduction en cours…</p>
                    ) : meaning.state === "done" ? (
                      <>
                        <p className="mt-1 text-lg leading-snug font-semibold">« {meaning.french} »</p>
                        <p className="mt-1 text-xs text-fg-muted">
                          {meaning.fromLexicon ? "D'après le lexique de Tamilya." : "Deviné d'après la conversation, à vérifier."}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1.5 text-sm text-fg-muted">{meaning.message}</p>
                    )}
                  </div>
                ) : null}

                <div className="mt-6 space-y-4">
                  <div hidden={mode === "approve"}>
                    <div className="flex items-center justify-between gap-2">
                      <label htmlFor="correct-wrote" className={labelClass}>
                        Ce que Tamilya a écrit
                      </label>
                      {form.wrote.trim() && meaning?.state !== "loading" ? (
                        <button
                          type="button"
                          onClick={() => void explain(form.wrote.trim())}
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-accent transition hover:bg-accent-soft"
                        >
                          {meaning ? "Retraduire" : "Voir le sens en français"}
                        </button>
                      ) : null}
                    </div>
                    <input
                      id="correct-wrote"
                      value={form.wrote}
                      maxLength={MAX}
                      disabled={saving}
                      autoComplete="off"
                      spellCheck={false}
                      autoFocus={!form.wrote}
                      placeholder="Recopiez le mot ou la phrase à corriger"
                      onChange={(e) => set("wrote", e.target.value)}
                      className={`${inputClass} bg-bg-muted/70 text-fg-muted line-through decoration-danger/70 focus:no-underline`}
                    />
                  </div>

                  <label className="block">
                    <span className={`${labelClass} ${mode === "approve" ? "text-success" : "text-accent"}`}>
                      {mode === "approve" ? "Phrase juste · shimaoré" : "Il fallait dire · shimaoré"}
                    </span>
                    <input
                      autoFocus={mode === "approve" ? !form.shimaore : Boolean(form.wrote)}
                      placeholder={mode === "approve" ? "Collez la phrase juste (ou sélectionnez-la dans la réponse)" : undefined}
                      value={form.shimaore}
                      maxLength={MAX}
                      disabled={saving}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => set("shimaore", e.target.value)}
                      className={`${inputClass} font-medium`}
                    />
                  </label>

                  <label className="block">
                    <span className="flex items-center justify-between gap-2">
                      <span className={labelClass}>Ça veut dire · français</span>
                      {mode === "approve" && form.shimaore.trim() && meaning?.state !== "loading" && !form.french.trim() ? (
                        <button
                          type="button"
                          onClick={() => void explain(form.shimaore.trim())}
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-accent transition hover:bg-accent-soft"
                        >
                          Proposer le sens
                        </button>
                      ) : null}
                    </span>
                    <input
                      placeholder={mode === "approve" && meaning?.state === "loading" ? "Traduction en cours…" : undefined}
                      value={form.french}
                      maxLength={MAX}
                      disabled={saving}
                      autoComplete="off"
                      onChange={(e) => set("french", e.target.value)}
                      className={inputClass}
                    />
                  </label>

                  <label className="block">
                    <span className={labelClass}>
                      Contexte <span className="font-normal tracking-normal normal-case">(facultatif)</span>
                    </span>
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
                      className={inputClass}
                    />
                    <span className="mt-1.5 block text-xs leading-relaxed text-fg-muted">
                      Vide : la correction remplace la traduction partout. Rempli : elle s&apos;ajoute pour cette situation.
                    </span>
                  </label>
                </div>

                {status ? (
                  <p
                    role="status"
                    className={`mt-5 rounded-xl px-3.5 py-2.5 text-sm ${status.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}
                  >
                    {status.ok ? "✓ " : ""}
                    {status.message}
                  </p>
                ) : null}

                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setForm(null)}
                    className="flex-1 rounded-xl border border-border bg-bg/70 px-4 py-2.5 text-sm font-medium text-fg transition hover:bg-bg-muted"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => void save()}
                    disabled={saving || !form.shimaore.trim() || !form.french.trim()}
                    className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-fg shadow-sm transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {saving ? "Enregistrement…" : "Retenir"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

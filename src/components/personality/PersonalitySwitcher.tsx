"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type CSSProperties } from "react";
import { choosePersonalityAction } from "@/app/parametres/actions";
import { useAuth } from "@/components/auth/AuthProvider";
import { PERSONALITIES, PERSONALITY_IDS, type PersonalityId } from "@/lib/ai/personalities";
import { PERSONALITY_LOOKS } from "@/lib/ai/personality-looks";
import { useCurrentPersonality } from "./PersonalityContext";

/**
 * Pastille de couleur dans la barre de saisie : affiche la personnalité d'Awa
 * et permet d'en changer. Le changement s'applique au message suivant (le
 * serveur relit le choix en base). Visiteur sans compte : propose l'inscription.
 */
export function PersonalitySwitcher() {
  const { user, openAuthDialog } = useAuth();
  const router = useRouter();
  const { current, setChosen } = useCurrentPersonality();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const p = PERSONALITIES[current];

  // Fermeture : clic à l'extérieur ou Échap (le focus revient sur le bouton).
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    rootRef.current?.querySelector<HTMLElement>("[aria-checked=true]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  // Message d'erreur affiché quelques secondes.
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  function toggle() {
    if (!user) {
      openAuthDialog({ mode: "signup", reason: "Créez un compte pour choisir la personnalité d'Awa." });
      return;
    }
    setOpen((v) => !v);
  }

  function choose(id: PersonalityId) {
    setOpen(false);
    triggerRef.current?.focus();
    if (id === current) return;
    const previous = current;
    // Optimiste : la couleur de la conversation change tout de suite.
    setChosen(id);
    setError(null);
    startTransition(async () => {
      const result = await choosePersonalityAction(id);
      if (result.status === "error") {
        setChosen(previous);
        setError(result.message ?? "Le changement a échoué.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div ref={rootRef} className="relative shrink-0 self-end">
      {open ? (
        <>
          {/* Page floutée derrière le menu ; un clic dessus le ferme. */}
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-30 bg-black/25 backdrop-blur-sm"
          />
          <div
            id={menuId}
            role="menu"
            aria-label="Personnalité d'Awa"
            className="absolute bottom-full left-0 z-40 mb-3 w-72 overflow-hidden rounded-3xl border border-white/10 bg-[color-mix(in_srgb,var(--bg)_75%,transparent)] p-1.5 shadow-2xl backdrop-blur-2xl"
          >
            <p className="px-3 pt-2.5 pb-2 text-[11px] font-semibold tracking-wider text-fg-muted uppercase">
              Le ton d&apos;Awa
            </p>
            {PERSONALITY_IDS.map((id) => {
              const item = PERSONALITIES[id];
              const checked = id === current;
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  onClick={() => choose(id)}
                  style={{ "--c": PERSONALITY_LOOKS[id].color } as CSSProperties}
                  className={`group flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left transition focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--c)] ${
                    checked
                      ? "bg-[color-mix(in_srgb,var(--c)_16%,transparent)]"
                      : "hover:bg-[color-mix(in_srgb,var(--c)_10%,transparent)]"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="grid size-10 shrink-0 place-items-center rounded-xl text-xl leading-none shadow-sm transition group-hover:scale-105"
                    style={{
                      backgroundImage: `linear-gradient(155deg, color-mix(in srgb, ${PERSONALITY_LOOKS[id].color} 85%, white), color-mix(in srgb, ${PERSONALITY_LOOKS[id].color} 50%, black))`,
                    }}
                  >
                    {item.emoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-semibold ${checked ? "text-[var(--c)]" : ""}`}>{item.label}</span>
                    <span className="block truncate text-xs text-fg-muted">
                      {PERSONALITY_LOOKS[id].traits.join(" · ")}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-black transition ${
                      checked ? "bg-[var(--c)] text-white" : "border border-border"
                    }`}
                  >
                    {checked ? "✓" : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="absolute bottom-full left-0 z-30 mb-3 w-64 rounded-xl bg-danger px-3 py-2 text-xs text-white shadow-lg"
        >
          {error}
        </p>
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Personnalité d'Awa : ${p.label}. Changer`}
        title="Changer la personnalité d'Awa"
        style={{ "--c": PERSONALITY_LOOKS[current].color } as CSSProperties}
        className={`relative flex h-9 items-center gap-1.5 rounded-full bg-[var(--c)] pr-3 pl-2 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c)] ${
          open ? "z-40" : ""
        } ${pending ? "opacity-70" : ""}`}
      >
        <span aria-hidden="true" className="text-base leading-none">
          {p.emoji}
        </span>
        <span className="hidden sm:inline">{p.label}</span>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>
    </div>
  );
}

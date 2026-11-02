"use client";

import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { IconSend, IconStop } from "@/components/ui/icons";
import { CHAT_LIMITS } from "@/lib/chat/limits";

export type ComposerHandle = { focus: () => void };

type ComposerProps = {
  isStreaming: boolean;
  disabled: boolean;
  disabledReason?: string;
  onSend: (text: string) => void;
  onStop: () => void;
  /** Élément affiché à gauche du champ (sélecteur de personnalité). */
  leading?: ReactNode;
  /** Élément affiché juste avant le bouton d'envoi (micro). */
  trailing?: ReactNode;
  /** Texte d'invitation du champ vide. */
  placeholder?: string;
  /** Exemples qui défilent dans le champ vide, à la place du texte fixe (le premier : placeholder). */
  examples?: readonly string[];
};

const MAX_HEIGHT_PX = 220;
/** Temps d'affichage de chaque exemple. */
const EXAMPLE_MS = 3200;

/**
 * Invitation du champ vide : le texte de base, puis des exemples qui
 * montent et s'effacent l'un après l'autre. Purement visuelle (aria-hidden) :
 * le lecteur d'écran lit le placeholder du champ.
 */
function RotatingHint({ texts }: { texts: readonly string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (texts.length < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % texts.length), EXAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [texts.length]);
  const text = texts[index % texts.length];
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-x-3 top-1.5 overflow-hidden py-1.5 text-base leading-6 text-fg-muted">
      <span key={text} className="composer-hint block truncate">
        {text}
      </span>
    </span>
  );
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { isStreaming, disabled, disabledReason, onSend, onStop, leading, trailing, placeholder = "Écris à Awa…", examples },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
  const rotating = !disabled && value === "" && examples && examples.length > 0;
  const max = CHAT_LIMITS.maxUserMessageChars;
  const tooLong = value.length > max;
  const canSend = !disabled && !isStreaming && value.trim().length > 0 && !tooLong;

  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }), []);

  // Hauteur automatique selon le contenu.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  function submit() {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      // Carte comme dans les grands assistants : le texte en haut, les outils en dessous.
      // Couleurs de la personnalité (--persona) si elles sont définies, sinon celles du site.
      className="rounded-[1.75rem] border border-[var(--persona-border,var(--border))] bg-bg p-2 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25)] transition-[border-color,box-shadow] focus-within:border-[var(--persona,var(--accent))] pointer-fine:focus-within:ring-4 pointer-fine:focus-within:ring-[color-mix(in_srgb,var(--persona,var(--accent))_12%,transparent)]"
    >
      <label htmlFor="composer" className="sr-only">
        Message à Awa
      </label>
      <div className="relative min-w-0 px-3 pt-1.5">
        {rotating ? <RotatingHint texts={[placeholder, ...examples]} /> : null}
        <textarea
          id="composer"
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled && disabledReason ? disabledReason : placeholder}
          aria-describedby="composer-hint"
          aria-invalid={tooLong || undefined}
          className={`relative block max-h-[220px] w-full resize-none bg-transparent py-1.5 text-base leading-6 outline-none placeholder:text-fg-muted disabled:cursor-not-allowed ${
            rotating ? "placeholder:text-transparent" : ""
          }`}
        />
        <p id="composer-hint" className="truncate pb-1 text-xs text-fg-muted empty:hidden">
          {value.length > max * 0.8 ? (
            <span className={tooLong ? "text-danger" : undefined}>
              {value.length} / {max} caractères
            </span>
          ) : null}
        </p>
      </div>
      <div className="flex items-center gap-1.5">
        {leading}
        <span className="flex-1" />
        {trailing}
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Arrêter la génération"
            aria-keyshortcuts="Escape"
            title="Arrêter (Échap)"
            className="grid size-9 shrink-0 place-items-center rounded-full pointer-coarse:size-10 bg-fg text-bg hover:opacity-85"
          >
            <IconStop />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Envoyer le message"
            className="grid size-9 shrink-0 place-items-center rounded-full pointer-coarse:size-10 bg-[var(--persona,var(--accent))] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100"
          >
            <IconSend />
          </button>
        )}
      </div>
    </form>
  );
});

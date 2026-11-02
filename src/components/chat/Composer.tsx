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
    <span aria-hidden="true" className="pointer-events-none absolute inset-x-1.5 top-0 overflow-hidden py-1.5 text-base sm:inset-x-3 sm:top-1.5 sm:py-1.5 leading-6 text-fg-muted">
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

  // Hauteur automatique selon le contenu. Vide : une seule ligne (le texte d'aide ne compte pas),
  // et recalculée quand la largeur change (au chargement, la barre peut être mesurée trop étroite).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const fit = () => {
      if (!el.value) {
        el.style.height = "";
        return;
      }
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
    };
    fit();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
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
      // Téléphone : une seule ligne fine (ton, texte, micro, envoi).
      // Ordinateur : carte comme dans les grands assistants, le texte en haut, les outils en dessous.
      // Couleurs de la personnalité (--persona) si elles sont définies, sinon celles du site.
      className="flex flex-nowrap items-end gap-1 rounded-full border p-1.5 pl-1.5 sm:flex-wrap sm:gap-1.5 sm:rounded-[1.75rem] sm:p-2 border-[var(--persona-border,var(--border))] bg-bg shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25)] transition-[border-color,box-shadow] focus-within:border-[var(--persona,var(--accent))] pointer-fine:focus-within:ring-4 pointer-fine:focus-within:ring-[color-mix(in_srgb,var(--persona,var(--accent))_12%,transparent)]"
    >
      <label htmlFor="composer" className="sr-only">
        Message à Awa
      </label>
      <div className="relative order-2 min-w-0 flex-1 basis-0 px-1.5 sm:order-first sm:basis-full sm:px-3 sm:pt-1.5">
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
          className={`relative block max-h-[160px] w-full resize-none bg-transparent py-1.5 text-base sm:max-h-[220px] sm:py-1.5 leading-6 outline-none placeholder:text-fg-muted disabled:cursor-not-allowed ${
            rotating ? "placeholder:text-transparent" : ""
          }`}
        />
        <p id="composer-hint" className="truncate text-xs sm:pb-1 text-fg-muted empty:hidden">
          {value.length > max * 0.8 ? (
            <span className={tooLong ? "text-danger" : undefined}>
              {value.length} / {max} caractères
            </span>
          ) : null}
        </p>
      </div>
      <div className="order-1 flex shrink-0">{leading}</div>
      <span className="order-3 hidden flex-1 sm:block" />
      <div className="order-4 flex shrink-0 items-center gap-0.5 sm:gap-1.5">
        {trailing}
        {isStreaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Arrêter la génération"
            aria-keyshortcuts="Escape"
            title="Arrêter (Échap)"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-fg text-bg hover:opacity-85 sm:pointer-coarse:size-10"
          >
            <IconStop />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label="Envoyer le message"
            className="grid size-9 shrink-0 place-items-center rounded-full sm:pointer-coarse:size-10 bg-[var(--persona,var(--accent))] text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:brightness-100"
          >
            <IconSend />
          </button>
        )}
      </div>
    </form>
  );
});

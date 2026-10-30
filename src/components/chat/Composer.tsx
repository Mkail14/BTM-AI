"use client";

import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
};

const MAX_HEIGHT_PX = 220;

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { isStreaming, disabled, disabledReason, onSend, onStop, leading, trailing },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");
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
      // Couleurs de la personnalité (--persona) si elles sont définies, sinon celles du site.
      className={`flex items-end gap-2 rounded-[1.75rem] border border-[var(--persona-border,var(--border))] bg-bg py-2 pr-2 shadow-sm transition-[border-color,box-shadow] focus-within:border-[var(--persona,var(--accent))] pointer-fine:focus-within:ring-4 pointer-fine:focus-within:ring-[color-mix(in_srgb,var(--persona,var(--accent))_15%,transparent)] ${
        leading ? "pl-2" : "pl-5"
      }`}
    >
      {leading}
      <label htmlFor="composer" className="sr-only">
        Message à Awa
      </label>
      {/* Une seule ligne : le champ s'agrandit avec le texte, le bouton reste à droite. */}
      <div className="min-w-0 flex-1">
        <textarea
          id="composer"
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled && disabledReason ? disabledReason : "Écrivez votre message…"}
          aria-describedby="composer-hint"
          aria-invalid={tooLong || undefined}
          className="block max-h-[220px] w-full resize-none bg-transparent py-1.5 text-base leading-6 outline-none placeholder:text-fg-muted disabled:cursor-not-allowed"
        />
        <p id="composer-hint" className="truncate pb-1 text-xs text-fg-muted empty:hidden">
          {value.length > max * 0.8 ? (
            <span className={tooLong ? "text-danger" : undefined}>
              {value.length} / {max} caractères
            </span>
          ) : null}
        </p>
      </div>
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
    </form>
  );
});

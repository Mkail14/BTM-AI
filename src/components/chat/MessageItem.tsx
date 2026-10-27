"use client";

import { memo } from "react";
import { IconRetry } from "@/components/ui/icons";
import type { ChatRole } from "@/lib/chat/types";
import { Markdown } from "./Markdown";

export type UiMessageStatus = "complete" | "streaming" | "interrupted" | "error";

export type UiMessage = {
  id: string;
  role: ChatRole;
  content: string;
  status: UiMessageStatus;
  /** Information complémentaire (erreur, réponse tronquée…). */
  notice?: string;
};

export const MessageItem = memo(function MessageItem({
  message,
  onRetry,
}: {
  message: UiMessage;
  onRetry?: () => void;
}) {
  if (message.role === "user") {
    return (
      <article className="flex items-center justify-end gap-2">
        <h3 className="sr-only">Vous avez écrit :</h3>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            aria-label="Relancer ce message"
            title="Relancer ce message"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-border text-fg-muted transition-transform hover:rotate-[-45deg] hover:bg-bg-muted hover:text-fg"
          >
            <IconRetry width={16} height={16} />
          </button>
        ) : null}
        <div className="max-w-[85%] rounded-2xl bg-[var(--persona-soft,var(--bg-muted))] px-4 py-2.5 whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </article>
    );
  }

  const waiting = message.status === "streaming" && !message.content;

  return (
    <article className="min-w-0" aria-busy={message.status === "streaming"}>
      <h3 className="sr-only">Awa a répondu :</h3>
      {waiting ? (
        <p className="flex items-center gap-2 text-fg-muted">
          <span className="flex gap-1 text-[var(--persona,currentColor)]" aria-hidden="true">
            <span className="size-1.5 animate-pulse rounded-full bg-current" />
            <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
          </span>
          <span className="text-sm">Awa rédige une réponse…</span>
        </p>
      ) : message.content ? (
        <Markdown text={message.content} />
      ) : null}

      {message.status === "interrupted" ? (
        <p className="mt-2 text-xs text-fg-muted">{message.notice ?? "Réponse interrompue."}</p>
      ) : null}

      {message.status === "error" ? (
        <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {message.notice ?? "La réponse n'a pas pu être générée."}
        </p>
      ) : null}
    </article>
  );
});

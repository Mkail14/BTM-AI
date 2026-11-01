"use client";

import { memo, useState } from "react";
import { IconRetry } from "@/components/ui/icons";
import type { ChatRole } from "@/lib/chat/types";
import { Correctable } from "./Correctable";
import { Markdown } from "./Markdown";
import { useTypewriter } from "./useTypewriter";

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
  question,
  onRetry,
}: {
  message: UiMessage;
  /** Réponse d'Awa : le message de l'utilisateur auquel elle répond. */
  question?: string;
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

  return <AssistantMessage message={message} question={question} />;
});

function AssistantMessage({ message, question }: { message: UiMessage; question?: string }) {
  const streaming = message.status === "streaming";
  // Seule une réponse reçue en direct s'écrit lettre à lettre ; l'historique s'affiche d'un coup.
  const [animate] = useState(streaming);
  const { text, typing } = useTypewriter(message.content, { animate, finished: !streaming });
  const writing = streaming || typing;
  const waiting = writing && !text;

  return (
    <article className="min-w-0" aria-busy={writing}>
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
      ) : text ? (
        writing ? (
          // Point qui clignote au bout du texte pendant qu'Awa écrit.
          <div className="typing-cursor">
            <Markdown text={text} />
          </div>
        ) : (
          // Maître d'Awa : sélection d'un passage pour le corriger (sans effet pour les autres).
          <Correctable messageId={message.id} reply={message.content} question={question}>
            <Markdown text={message.content} />
          </Correctable>
        )
      ) : null}

      {message.status === "interrupted" && !typing ? (
        <p className="mt-2 text-xs text-fg-muted">{message.notice ?? "Réponse interrompue."}</p>
      ) : null}

      {message.status === "error" && !typing ? (
        <p role="alert" className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {message.notice ?? "La réponse n'a pas pu être générée."}
        </p>
      ) : null}
    </article>
  );
}

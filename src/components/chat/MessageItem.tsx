"use client";

import { memo, useEffect, useState, useSyncExternalStore } from "react";
import { useCurrentPersonality } from "@/components/personality/PersonalityContext";
import { IconCheck, IconCopy, IconRetry, IconSpeaker, IconStop } from "@/components/ui/icons";
import { PERSONALITIES } from "@/lib/ai/personalities";
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

/** Texte lisible d'une réponse : sans blocs spéciaux (commande, créneaux), sans Markdown. */
function plainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[*_#>`]/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .trim();
}

/** Petit bouton d'action sous un message (copier, écouter…), avec infobulle. */
function Action({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center rounded-lg text-fg-muted transition hover:bg-bg-muted hover:text-fg"
    >
      {children}
    </button>
  );
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <Action
      label={copied ? "Copié" : "Copier"}
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => setCopied(true));
      }}
    >
      {copied ? <IconCheck width={16} height={16} className="text-success" /> : <IconCopy width={16} height={16} />}
    </Action>
  );
}

const noSubscribe = () => () => {};

/** Lecture à voix haute par le navigateur (voix française). */
function SpeakAction({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  // Lu après l'hydratation : le serveur ne sait pas si le navigateur peut lire à voix haute.
  const supported = useSyncExternalStore(noSubscribe, () => "speechSynthesis" in window, () => false);
  if (!supported) return null;
  return (
    <Action
      label={speaking ? "Arrêter la lecture" : "Écouter"}
      onClick={() => {
        const synth = window.speechSynthesis;
        synth.cancel();
        if (speaking) return setSpeaking(false);
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "fr-FR";
        utterance.onend = utterance.onerror = () => setSpeaking(false);
        setSpeaking(true);
        synth.speak(utterance);
      }}
    >
      {speaking ? <IconStop width={14} height={14} /> : <IconSpeaker width={16} height={16} />}
    </Action>
  );
}

/** Avatar d'Awa : pastille à la couleur et à l'emoji de sa personnalité. */
function AwaAvatar({ busy }: { busy: boolean }) {
  const { current } = useCurrentPersonality();
  return (
    <span
      aria-hidden="true"
      className={`grid size-8 shrink-0 place-items-center rounded-full bg-[var(--persona-soft,var(--bg-muted))] text-base ring-1 ring-[var(--persona-border,var(--border))] ${busy ? "animate-pulse" : ""}`}
    >
      {PERSONALITIES[current].emoji}
    </span>
  );
}

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
      <article className="group flex flex-col items-end gap-1">
        <h3 className="sr-only">Vous avez écrit :</h3>
        <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-[var(--persona-soft,var(--bg-muted))] px-4 py-2.5 leading-relaxed whitespace-pre-wrap break-words sm:max-w-[75%]">
          {message.content}
        </div>
        <div className="flex items-center gap-0.5 opacity-100 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100">
          {onRetry ? (
            <Action label="Relancer ce message" onClick={onRetry}>
              <IconRetry width={16} height={16} />
            </Action>
          ) : null}
          <CopyAction text={message.content} />
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
  const readable = writing ? "" : plainText(message.content);

  return (
    <article className="group flex min-w-0 gap-3" aria-busy={writing}>
      <h3 className="sr-only">Awa a répondu :</h3>
      <AwaAvatar busy={waiting} />
      <div className="min-w-0 flex-1 pt-1">
        {waiting ? (
          <p className="flex h-6 items-center gap-1 text-[var(--persona,var(--fg-muted))]" aria-label="Awa rédige une réponse">
            <span className="size-1.5 animate-bounce rounded-full bg-current" />
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:120ms]" />
            <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:240ms]" />
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
          <p role="alert" className="mt-2 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">
            {message.notice ?? "La réponse n'a pas pu être générée."}
          </p>
        ) : null}

        {/* Actions, une fois la réponse terminée : discrètes, visibles au survol sur ordinateur. */}
        {readable && message.status !== "error" ? (
          <div className="-ml-1.5 mt-1 flex items-center gap-0.5 opacity-100 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-within:opacity-100">
            <CopyAction text={readable} />
            <SpeakAction text={readable} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

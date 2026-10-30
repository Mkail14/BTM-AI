"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { useChatShell } from "@/components/layout/ChatShell";
import { useCurrentPersonality } from "@/components/personality/PersonalityContext";
import { PersonalitySwitcher } from "@/components/personality/PersonalitySwitcher";
import { PERSONALITIES } from "@/lib/ai/personalities";
import { IconMenu, IconMic, IconOffline, IconSave } from "@/components/ui/icons";
import {
  clearAnonymousDraft,
  loadAnonymousDraft,
  saveAnonymousDraft,
} from "@/lib/chat/anonymous-draft";
import { buildModelHistory } from "@/lib/chat/history";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { createStreamEventParser } from "@/lib/chat/stream-protocol";
import { hapticReady, hapticWriting } from "@/lib/chat/haptics";
import type { ChatStreamEvent, ChatTurn } from "@/lib/chat/types";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { Composer, type ComposerHandle } from "./Composer";
import { MessageItem, type UiMessage } from "./MessageItem";
import { useVoiceConversation } from "./useVoiceConversation";
import { VoiceOverlay } from "./VoiceOverlay";
import { TeachWordContext } from "./UnknownWord";
import { teachUnknownWordAction } from "@/app/(chat)/actions";
import { fillKnownWords, translationTable } from "@/lib/language/unknown-words";

type ChatViewProps = {
  conversationId: string | null;
  initialMessages: UiMessage[];
  /** Ouverture de la fenêtre de connexion demandée par une page privée. */
  authPrompt?: { next: string } | null;
};

const ANONYMOUS_MAX_EXCHANGES = CHAT_LIMITS.anonymousMaxMessages / 2;

function newId() {
  return crypto.randomUUID();
}

/** Échanges réussis, au format attendu par l'API. */
function settledTurns(messages: UiMessage[]): ChatTurn[] {
  return messages
    .filter((m) => (m.status === "complete" || m.status === "interrupted") && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content }));
}

function turnsToUi(turns: ChatTurn[]): UiMessage[] {
  return turns.map((t) => ({ id: newId(), role: t.role, content: t.content, status: "complete" }));
}

async function readErrorMessage(res: Response): Promise<{ code: string; message: string }> {
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string } };
    if (data.error?.message) return { code: data.error.code ?? "internal", message: data.error.message };
  } catch {
    // Corps non JSON.
  }
  return { code: "internal", message: "Le service ne répond pas correctement. Réessayez." };
}

export function ChatView({ conversationId: initialConversationId, initialMessages, authPrompt }: ChatViewProps) {
  const router = useRouter();
  const { user, openAuthDialog } = useAuth();
  const { current: persona } = useCurrentPersonality();
  const { refreshConversations, newChatSignal, openSidebar } = useChatShell();
  const online = useOnlineStatus();

  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [isStreaming, setIsStreaming] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [importCandidate, setImportCandidate] = useState<ChatTurn[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [liveStatus, setLiveStatus] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const isHome = initialConversationId === null;
  const userId = user?.id ?? null;

  // Mode vocal du maître d'Awa (administrateur) : il lui parle, elle répond à voix haute.
  const sendRef = useRef<(text: string) => void>(() => {});
  const voice = useVoiceConversation((text) => sendRef.current(text));
  const voiceEnabled = Boolean(user?.isAdmin) && voice.supported;
  const { replied: voiceReplied, stop: stopVoice } = voice;

  // Clic du maître sur un [[mot]] orange : la traduction est retenue pour
  // toujours, et le mot est remplacé partout dans la conversation affichée.
  const teachWord = useCallback(async (french: string, shimaore: string) => {
    const result = await teachUnknownWordAction({ french, shimaore });
    if (result.ok) {
      const table = translationTable([{ french, shimaore }]);
      setMessages((current) =>
        current.map((m) => (m.role === "assistant" ? { ...m, content: fillKnownWords(m.content, table) } : m)),
      );
    }
    return result;
  }, []);

  // Accueil : reprise de la conversation anonyme conservée dans le navigateur,
  // ou proposition d'enregistrement après connexion.
  useEffect(() => {
    if (!isHome) return;
    const draft = loadAnonymousDraft();
    if (!draft) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture de localStorage, indisponible au rendu serveur
    setMessages(turnsToUi(draft));
    setImportCandidate(userId ? draft : null);
  }, [isHome, userId]);

  // Visiteur : sauvegarde locale de l'échange.
  useEffect(() => {
    if (userId || !isHome || isStreaming) return;
    saveAnonymousDraft(settledTurns(messages));
  }, [messages, userId, isHome, isStreaming]);

  // Page privée demandée sans session : on propose la connexion sur place.
  useEffect(() => {
    if (!authPrompt) return;
    window.history.replaceState(null, "", "/");
    openAuthDialog({ reason: "Connectez-vous pour accéder à cette page.", next: authPrompt.next });
  }, [authPrompt, openAuthDialog]);

  // « Nouvelle conversation » depuis la barre latérale ou le raccourci clavier.
  const lastSignal = useRef(newChatSignal);
  useEffect(() => {
    if (lastSignal.current === newChatSignal) return;
    lastSignal.current = newChatSignal;
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(initialConversationId);
    setLimitReached(false);
    setImportCandidate(null);
    composerRef.current?.focus();
  }, [newChatSignal, initialConversationId]);

  // Défilement automatique tant que l'utilisateur est en bas de la conversation.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Clavier du téléphone ouvert ou fermé (la zone visible change de hauteur) :
  // le bas de la conversation reste collé à la zone de saisie, comme dans une app.
  const distanceFromBottom = useRef(0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let height = el.clientHeight;
    const observer = new ResizeObserver(() => {
      if (el.clientHeight === height) return;
      height = el.clientHeight;
      el.scrollTop = stickToBottom.current
        ? el.scrollHeight
        : el.scrollHeight - el.clientHeight - distanceFromBottom.current;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Échap : arrêter la génération.
  useEffect(() => {
    if (!isStreaming) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !document.querySelector("dialog[open]")) abortRef.current?.abort();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isStreaming]);

  const updateMessage = useCallback((id: string, update: (m: UiMessage) => UiMessage) => {
    setMessages((current) => current.map((m) => (m.id === id ? update(m) : m)));
  }, []);

  const send = useCallback(
    async (text: string, base: UiMessage[] = messages) => {
      if (isStreaming) return;
      const userMessage: UiMessage = { id: newId(), role: "user", content: text, status: "complete" };
      const assistantId = newId();
      setMessages([...base, userMessage, { id: assistantId, role: "assistant", content: "", status: "streaming" }]);
      setIsStreaming(true);
      setLiveStatus("Awa rédige une réponse.");
      stickToBottom.current = true;

      const controller = new AbortController();
      abortRef.current = controller;
      let createdConversationId: string | null = null;
      let settled = false;
      let writing = false;
      // Ce qu'Awa lira à voix haute en mode vocal : sa réponse, ou le message d'erreur.
      let reply = "";

      const handleEvent = (event: ChatStreamEvent) => {
        switch (event.type) {
          case "meta":
            if (!conversationId) createdConversationId = event.conversationId;
            setConversationId(event.conversationId);
            break;
          case "delta":
            // Téléphone : petite vibration quand Awa se met à écrire, puis quand elle a fini.
            if (!writing) hapticWriting();
            writing = true;
            reply += event.text;
            updateMessage(assistantId, (m) => ({ ...m, content: m.content + event.text }));
            break;
          case "done":
            settled = true;
            hapticReady();
            updateMessage(assistantId, (m) =>
              event.finishReason === "length"
                ? { ...m, status: "interrupted", notice: "Réponse tronquée : longueur maximale atteinte." }
                : { ...m, status: "complete" },
            );
            break;
          case "error":
            settled = true;
            if (!reply) reply = event.message;
            updateMessage(assistantId, (m) => ({
              ...m,
              status: m.content ? "interrupted" : "error",
              notice: event.message,
            }));
            break;
        }
      };

      try {
        const body = userId
          ? { message: text, ...(conversationId ? { conversationId } : {}) }
          : { message: text, history: buildModelHistory(settledTurns(base), CHAT_LIMITS.anonymousMaxHistoryChars) };

        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const error = await readErrorMessage(res);
          settled = true;
          reply = error.message;
          if (error.code === "conversation_too_long") setLimitReached(true);
          updateMessage(assistantId, (m) => ({ ...m, status: "error", notice: error.message }));
          return;
        }

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        const parser = createStreamEventParser();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.push(value).forEach(handleEvent);
        }
        parser.flush().forEach(handleEvent);
      } catch {
        if (!controller.signal.aborted) {
          settled = true;
          updateMessage(assistantId, (m) => ({
            ...m,
            status: m.content ? "interrupted" : "error",
            notice: navigator.onLine
              ? "La connexion avec le serveur a été interrompue."
              : "Vous êtes hors ligne. Vérifiez votre connexion internet.",
          }));
        }
      } finally {
        if (!settled) {
          // Arrêt demandé par l'utilisateur ou flux coupé sans fin explicite.
          updateMessage(assistantId, (m) => ({
            ...m,
            status: "interrupted",
            notice: controller.signal.aborted ? "Génération arrêtée." : "Réponse interrompue.",
          }));
        }
        setIsStreaming(false);
        setLiveStatus("Réponse d’Awa terminée.");
        abortRef.current = null;
        if (controller.signal.aborted) stopVoice();
        else voiceReplied(reply);

        if (userId) refreshConversations();
        if (createdConversationId) router.replace(`/c/${createdConversationId}`, { scroll: false });
      }
    },
    [conversationId, isStreaming, messages, refreshConversations, router, updateMessage, userId, voiceReplied, stopVoice],
  );

  useEffect(() => {
    sendRef.current = (text) => void send(text);
  }, [send]);

  const retryLast = useCallback(() => {
    const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
    if (lastUserIndex < 0) return;
    void send(messages[lastUserIndex].content, messages.slice(0, lastUserIndex));
  }, [messages, send]);

  async function acceptImport() {
    if (!importCandidate) return;
    setImporting(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: importCandidate.slice(-CHAT_LIMITS.anonymousMaxMessages) }),
      });
      if (!res.ok) {
        window.alert((await readErrorMessage(res)).message);
        return;
      }
      const data = (await res.json()) as { conversation: { id: string } };
      clearAnonymousDraft();
      setImportCandidate(null);
      refreshConversations();
      router.push(`/c/${data.conversation.id}`);
    } catch {
      window.alert("L'enregistrement a échoué : vérifiez votre connexion.");
    } finally {
      setImporting(false);
    }
  }

  function declineImport() {
    clearAnonymousDraft();
    setImportCandidate(null);
    setMessages([]);
  }

  const exchanges = settledTurns(messages).filter((m) => m.role === "assistant").length;
  const anonymousLimitReached = !userId && exchanges >= ANONYMOUS_MAX_EXCHANGES;
  const blocked = limitReached || anonymousLimitReached || importCandidate !== null;
  const lastMessage = messages.at(-1);
  // Réponse interrompue ou en erreur : le bouton de relance s'affiche à côté
  // de la question de l'utilisateur qui la précède.
  const retryTargetId =
    lastMessage?.role === "assistant" &&
    (lastMessage.status === "error" || lastMessage.status === "interrupted") &&
    !blocked &&
    online
      ? messages.findLast((m) => m.role === "user")?.id
      : undefined;

  return (
    // Toute la colonne défile : la barre de défilement couvre la hauteur complète
    // de l'écran ; l'en-tête et la zone de saisie restent collés (sticky).
    // relative : sans ancêtre positionné, les titres sr-only (position absolute)
    // des messages débordent du document et font défiler toute la page.
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        distanceFromBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickToBottom.current = distanceFromBottom.current < 80;
      }}
      // overscroll-contain : l'effet élastique en bout de liste ne fait pas bouger toute la page.
      className="relative flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain"
    >
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 persona-backdrop border-b border-border px-3 md:border-transparent md:px-5">
        <button
          type="button"
          onClick={openSidebar}
          className="rounded-lg p-2 text-fg-muted hover:bg-bg-muted md:hidden"
          aria-label="Ouvrir le menu"
        >
          <IconMenu />
        </button>
        <span className="md:hidden">
          <BrandLogo size="sm" />
        </span>
        <div className="ml-auto flex items-center gap-2">
          {!userId && settledTurns(messages).length > 0 ? (
            <button
              type="button"
              onClick={() =>
                openAuthDialog({
                  mode: "signup",
                  reason:
                    "Créez un compte ou connectez-vous pour enregistrer cette conversation. Nous vous demanderons confirmation avant de l'enregistrer.",
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg-muted"
            >
              <IconSave width={16} height={16} />
              Enregistrer
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
            <BrandLogo size="xl" />
            <h1 className="mt-8 text-2xl font-semibold tracking-tight sm:text-3xl">Que puis-je faire pour vous ?</h1>
            <p className="mt-3 max-w-md text-sm text-fg-muted">
              Posez votre question en français ou en shimaoré. Awa peut se tromper : vérifiez les informations
              importantes.
            </p>
            <p className="mt-5 inline-flex items-center gap-2 rounded-full border border-[var(--persona-border,var(--border))] bg-[var(--persona-soft,var(--bg-muted))] px-3 py-1 text-xs font-medium text-[var(--persona-text,var(--fg))]">
              <span aria-hidden="true">{PERSONALITIES[persona].emoji}</span>
              Awa · {PERSONALITIES[persona].label}
            </p>
          </div>
        ) : (
          <section aria-label="Conversation" className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6">
            <TeachWordContext value={user?.isAdmin ? teachWord : null}>
              {messages.map((message) => (
                <MessageItem
                  key={message.id}
                  message={message}
                  onRetry={message.id === retryTargetId ? retryLast : undefined}
                />
              ))}
            </TeachWordContext>
          </section>
        )}
      </div>

      {/* Fondu vers la teinte de la conversation : les messages passent dessous en douceur. */}
      <div className="composer-dock sticky bottom-0 z-10 shrink-0 bg-[linear-gradient(to_top,var(--persona-surface,var(--bg))_80%,transparent)] px-3 pt-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {!online ? (
            <p role="status" className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm">
              <IconOffline width={16} height={16} />
              Vous êtes hors ligne. Les messages pourront être envoyés au retour de la connexion.
            </p>
          ) : null}

          {importCandidate ? (
            <div role="region" aria-label="Enregistrer la conversation" className="rounded-xl border border-border bg-accent-soft p-4 text-sm">
              <p className="font-medium">Enregistrer la conversation commencée avant votre connexion ?</p>
              <p className="mt-1 text-fg-muted">
                Elle sera ajoutée à votre compte et vous pourrez la poursuivre. Si vous refusez, elle sera effacée de
                cet appareil.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={acceptImport}
                  disabled={importing}
                  className="rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg hover:bg-accent-hover disabled:opacity-60"
                >
                  {importing ? "Enregistrement…" : "Enregistrer dans mon compte"}
                </button>
                <button
                  type="button"
                  onClick={declineImport}
                  disabled={importing}
                  className="rounded-lg border border-border bg-bg px-3 py-1.5 font-medium hover:bg-bg-muted"
                >
                  Ne pas enregistrer
                </button>
              </div>
            </div>
          ) : null}

          {anonymousLimitReached || limitReached ? (
            <div role="status" className="rounded-xl border border-border bg-bg-subtle p-4 text-sm">
              <p className="font-medium">Cette conversation a atteint sa longueur maximale.</p>
              <p className="mt-1 text-fg-muted">
                {userId
                  ? "Démarrez une nouvelle conversation pour continuer."
                  : `Sans compte, une conversation est limitée à ${ANONYMOUS_MAX_EXCHANGES} échanges. Créez un compte gratuit pour enregistrer vos conversations, ou démarrez-en une nouvelle.`}
              </p>
              {!userId ? (
                <button
                  type="button"
                  onClick={() =>
                    openAuthDialog({ mode: "signup", reason: "Créez un compte pour enregistrer et poursuivre vos conversations." })
                  }
                  className="mt-3 rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-fg hover:bg-accent-hover"
                >
                  Créer un compte
                </button>
              ) : null}
            </div>
          ) : null}

          {voiceEnabled && voice.error ? (
            <p role="alert" className="mb-2 text-center text-sm text-danger">
              {voice.error}
            </p>
          ) : null}
          <Composer
            ref={composerRef}
            isStreaming={isStreaming}
            disabled={blocked || !online}
            disabledReason={!online ? "Hors ligne" : importCandidate ? "Choisissez d'abord ci-dessus" : "Conversation terminée"}
            onSend={(text) => void send(text)}
            onStop={() => abortRef.current?.abort()}
            leading={<PersonalitySwitcher />}
            trailing={
              voiceEnabled ? (
                <button
                  type="button"
                  onClick={voice.start}
                  disabled={blocked || !online || isStreaming}
                  aria-label="Parler à Awa"
                  title="Parler à Awa"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-fg-muted transition pointer-coarse:size-10 hover:bg-bg-muted hover:text-fg disabled:opacity-45"
                >
                  <IconMic />
                </button>
              ) : null
            }
          />
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {liveStatus}
      </p>
      {voiceEnabled ? <VoiceOverlay voice={voice} /> : null}
    </div>
  );
}

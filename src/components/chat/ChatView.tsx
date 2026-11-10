"use client";

import { Pictogram } from "@/components/ui/Pictogram";
import { Flower2 } from "lucide-react";
import { NotificationBell } from "./NotificationBell";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { alertDialog } from "@/components/ui/ConfirmDialog";
import { useChatShell } from "@/components/layout/ChatShell";
import { IconArrowDown, IconMenu, IconMic, IconOffline, IconPlus, IconSave } from "@/components/ui/icons";
import {
  clearAnonymousDraft,
  loadAnonymousDraft,
  saveAnonymousDraft,
} from "@/lib/chat/anonymous-draft";
import { SIGNATURE_HELP, SIGNATURE_HELP_EVENT, signaturesBlock } from "@/lib/attestation/intent";
import { buildModelHistory } from "@/lib/chat/history";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { createStreamEventParser } from "@/lib/chat/stream-protocol";
import type { ChatStreamEvent, ChatTurn } from "@/lib/chat/types";
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";
import { AwaBlob } from "./AwaBlob";
import { fadeOutHome, noteGlobeOrigin, takeGlobeOrigin } from "./globe-origin";
import { PlusMenu } from "./PlusMenu";
import { Composer, type ComposerHandle } from "./Composer";
import { MessageItem, type UiMessage } from "./MessageItem";
import { wantsSpokenReply } from "@/lib/voice-live/spoken-request";
import { readingMode } from "@/lib/lecture/intent";
import { useLiveVoiceConversation } from "./useLiveVoiceConversation";
import { useVoiceConversation } from "./useVoiceConversation";
import { VoiceOverlay } from "./VoiceOverlay";
import { SuggestionCarousel } from "./SuggestionCarousel";
import { TeachWordContext } from "./UnknownWord";
import { correctInContextAction, teachUnknownWordAction } from "@/app/(chat)/actions";
import { lostOk } from "@/lib/safe-action";
import { CorrectContext, type Correction } from "./Correctable";
import { replacePassage } from "@/lib/language/replace-passage";
import { fillKnownWords, translationTable } from "@/lib/language/unknown-words";
import { markVoice, markVoiceServer } from "@/lib/chat/voice-metrics";

/** Message de l'utilisateur auquel répond la réponse de Tamilya n° `index` (aide à comprendre ce qu'elle voulait dire). */
function questionBefore(messages: readonly UiMessage[], index: number): string | undefined {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return undefined;
}

type ChatViewProps = {
  conversationId: string | null;
  initialMessages: UiMessage[];
  /** Ouverture de la fenêtre de connexion demandée par une page privée. */
  authPrompt?: { next: string } | null;
  /** Message tapé sur la page d'accueil des visiteurs : envoyé dès qu'il arrive. */
  startWith?: string | null;
};

/** Messages d'essai déjà envoyés sans compte sur cet appareil (le serveur compte aussi, voir GUEST_TRIAL). */
const GUEST_SENT_KEY = "btm-guest-sent";
const readGuestSent = () => Number(localStorage.getItem(GUEST_SENT_KEY)) || 0;

/** Idées de questions sur l'écran d'accueil : un clic les envoie à Tamilya. */
/** Cartes de l'accueil : titre, précision, et le message envoyé au clic. */
const SUGGESTIONS = [
  { emoji: "🚗", title: "Passer le code", hint: "Le bureau le plus proche et ses créneaux", text: "Où passer le code près de chez moi ?" },
  { emoji: "🗣️", title: "Parler shimaoré", hint: "Bonjour, merci, compter…", text: "Apprends-moi à dire bonjour en shimaoré" },
  { emoji: "💼", title: "Trouver un emploi", hint: "Les offres du moment à Mayotte", text: "Quelles offres d'emploi à Mayotte ?" },
  { emoji: "📰", title: "L'actu de Mayotte", hint: "Ce qui se passe aujourd'hui", text: "Quoi de neuf à Mayotte aujourd'hui ?" },
];
/** Commande de repas : proposée aux comptes qui y ont accès (démonstration). */
const FOOD_SUGGESTION = { emoji: "🌮", title: "Commander à manger", hint: "Tacos, pizza, plats mahorais…", text: "Je veux un tacos près de chez moi" };

/** Exemples qui défilent dans le champ de message vide. */
const EXAMPLES = [
  "Comment dit-on « merci » en shimaoré ?",
  "Où passer le code de la route à Mamoudzou ?",
  "Aide-moi à écrire mon CV",
  "Quelles offres d'emploi en ce moment ?",
];
const FOOD_EXAMPLE = "Commande-moi un tacos";

/** « Bonjour » ou « Bonsoir », à l'heure de Mayotte. */
function greeting() {
  const hour = Number(new Intl.DateTimeFormat("fr-FR", { hour: "numeric", hour12: false, timeZone: "Indian/Mayotte" }).format(new Date()));
  return hour >= 18 || hour < 4 ? "Bonsoir" : "Bonjour";
}

/** Temps laissé à l'explication pour s'écrire avant que le bloc des photos revienne. */
const SIGNATURES_BLOCK_DELAY_MS = 2_500;

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
    const data = (await res.json()) as { error?: string | { code?: string; message?: string } };
    // Texte seul : réponse du proxy (site passé en maintenance pendant la conversation).
    if (typeof data.error === "string" && data.error) return { code: "service_unavailable", message: data.error };
    if (typeof data.error === "object" && data.error?.message) return { code: data.error.code ?? "internal", message: data.error.message };
  } catch {
    // Corps non JSON.
  }
  return { code: "internal", message: "Le service ne répond pas correctement. Réessaie." };
}

export function ChatView({ conversationId: initialConversationId, initialMessages, authPrompt, startWith = null }: ChatViewProps) {
  const router = useRouter();
  const { user, openAuthDialog } = useAuth();
  const { refreshConversations, newChatSignal, openSidebar, startNewChat } = useChatShell();
  const online = useOnlineStatus();

  const [messages, setMessages] = useState<UiMessage[]>(initialMessages);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [isStreaming, setIsStreaming] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  // Visiteur sans compte : messages d'essai déjà utilisés (toutes conversations confondues).
  const [guestSent, setGuestSent] = useState(0);
  const [trialOver, setTrialOver] = useState(false);
  const [importCandidate, setImportCandidate] = useState<ChatTurn[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [liveStatus, setLiveStatus] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  // Augmente à chaque « Nouvelle conversation » : une réponse lancée avant ne touche plus ni l'adresse ni la conversation en cours.
  const chatGeneration = useRef(0);
  const composerRef = useRef<ComposerHandle>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  // Bouton « revenir en bas » quand on a remonté la conversation.
  const [showJump, setShowJump] = useState(false);
  const isHome = initialConversationId === null;
  const userId = user?.id ?? null;

  // Mode vocal du maître de Tamilya (administrateur) : il lui parle, elle répond à voix haute.
  const sendRef = useRef<(text: string, spoken?: boolean) => void>(() => {});
  // Message dicté : le serveur le sait, Tamilya répond court, pour être écoutée.
  const legacyVoice = useVoiceConversation((text) => sendRef.current(text, true));
  // Vocal en direct (Gemini Live, comme ChatGPT Voice) : chaque échange s'ajoute à la conversation.
  const liveTurnRef = useRef<(user: string, tamilya: string) => void>(() => {});
  // Même conversation qu'à l'écrit : à l'ouverture du vocal, Tamilya reçoit ce qui a été dit avant.
  const liveVoice = useLiveVoiceConversation(
    (userText, tamilya) => liveTurnRef.current(userText, tamilya),
    conversationId,
  );
  const voice = liveVoice.supported ? liveVoice : legacyVoice;
  const voiceEnabled = Boolean(user?.isAdmin) && voice.supported;
  // Ancien mode (dictée + réponse écrite lue) : appelé depuis l'envoi d'un message dicté.
  const { replied: voiceReplied, say: voiceSay, stop: stopVoice } = legacyVoice;

  // Clic du maître sur un [[mot]] orange : la traduction est retenue pour
  // toujours, et le mot est remplacé partout dans la conversation affichée.
  const teachWord = useCallback(async (french: string, shimaore: string) => {
    const result = await teachUnknownWordAction({ french, shimaore }).catch(lostOk);
    if (result.ok) {
      const table = translationTable([{ french, shimaore }]);
      setMessages((current) =>
        current.map((m) => (m.role === "assistant" ? { ...m, content: fillKnownWords(m.content, table) } : m)),
      );
    }
    return result;
  }, []);

  // Sélection corrigée par le maître : retenue (avec son contexte éventuel) et
  // remplacée tout de suite dans la réponse affichée.
  const correctPassage = useCallback(async (messageId: string, correction: Correction) => {
    const { shimaore, french, context, wrote } = correction;
    const result = await correctInContextAction({ shimaore, french, context }).catch(lostOk);
    if (result.ok && wrote && wrote !== shimaore) {
      setMessages((current) =>
        current.map((m) => (m.id === messageId ? { ...m, content: replacePassage(m.content, wrote, shimaore) } : m)),
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

  // Déconnexion : la conversation du compte (commandes, livraisons…) disparaît de l'écran,
  // et n'est jamais gardée comme conversation de visiteur sur l'appareil.
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (userId) {
      wasSignedIn.current = true;
      return;
    }
    if (!wasSignedIn.current) return;
    chatGeneration.current += 1;
    abortRef.current?.abort();
    clearAnonymousDraft();
    setMessages([]);
    setConversationId(null);
    setImportCandidate(null);
  }, [userId]);

  // Visiteur : sauvegarde locale de l'échange.
  useEffect(() => {
    if (userId || wasSignedIn.current || !isHome || isStreaming) return;
    saveAnonymousDraft(settledTurns(messages));
  }, [messages, userId, isHome, isStreaming]);

  // Page privée demandée sans session : on propose la connexion sur place.
  useEffect(() => {
    if (!authPrompt) return;
    window.history.replaceState(null, "", "/");
    openAuthDialog({ reason: "Connecte-toi pour accéder à cette page.", next: authPrompt.next });
  }, [authPrompt, openAuthDialog]);

  // « Nouvelle conversation » depuis la barre latérale ou le raccourci clavier.
  const lastSignal = useRef(newChatSignal);
  useEffect(() => {
    if (lastSignal.current === newChatSignal) return;
    lastSignal.current = newChatSignal;
    chatGeneration.current += 1;
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

  // La réponse s'écrit lettre à lettre (useTypewriter) sans changer `messages` :
  // le contenu qui grandit fait lui aussi descendre la conversation.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new MutationObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  // Un bloc qui grandit après coup (horaires chargés, carte ouverte, animation) ne
  // change pas forcément le DOM : on suit aussi la hauteur du contenu.
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

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
    async (text: string, base: UiMessage[] = messages, spoken = false) => {
      if (isStreaming) return;
      const generation = chatGeneration.current;
      const stale = () => chatGeneration.current !== generation;
      // Essai sans compte : le message ne compte qu'une fois la réponse vraiment commencée (pas sur une erreur 503).
      let counted = Boolean(userId);
      const countGuestMessage = () => {
        if (counted) return;
        counted = true;
        const sent = readGuestSent() + 1;
        try {
          localStorage.setItem(GUEST_SENT_KEY, String(sent));
        } catch {}
        setGuestSent(sent);
      };
      const userMessage: UiMessage = { id: newId(), role: "user", content: text, status: "complete" };
      const assistantId = newId();
      // Début de conversation : le grand globe de l'accueil glisse jusqu'à la première réponse (MessageItem).
      if (base.length === 0 && !spoken) {
        noteGlobeOrigin(takeGlobeOrigin() ?? scrollRef.current?.querySelector(".awa-blob-home")?.getBoundingClientRect() ?? null);
        // Le bonjour et les idées s'effacent en douceur pendant que le globe vole.
        fadeOutHome(contentRef.current?.firstElementChild);
      }
      setMessages([...base, userMessage, { id: assistantId, role: "assistant", content: "", status: "streaming" }]);
      setIsStreaming(true);
      setLiveStatus("Tamilya rédige une réponse.");
      stickToBottom.current = true;

      const controller = new AbortController();
      abortRef.current = controller;
      let createdConversationId: string | null = null;
      let settled = false;
      // Ce que Tamilya lira à voix haute en mode vocal : sa réponse, ou le message d'erreur.
      let reply = "";

      const handleEvent = (event: ChatStreamEvent) => {
        switch (event.type) {
          case "meta":
            countGuestMessage();
            if (stale()) break;
            if (!conversationId) createdConversationId = event.conversationId;
            setConversationId(event.conversationId);
            break;
          case "delta":
            countGuestMessage();
            reply += event.text;
            if (spoken) markVoice("firstToken");
            updateMessage(assistantId, (m) => ({ ...m, content: m.content + event.text }));
            break;
          case "speech":
            // Mode vocal : phrase terminée, lue tout de suite pendant que la suite s'écrit.
            if (spoken) markVoice("firstSentence");
            if (spoken && !stale()) voiceSay(event.text);
            break;
          case "timing":
            if (spoken) markVoiceServer({ firstTokenMs: event.firstTokenMs });
            break;
          case "team":
            // Question difficile : Tamilya consulte son équipe, affiché sous les trois points d'attente.
            if (!stale()) {
              updateMessage(assistantId, (m) => ({ ...m, team: event.agents }));
              setLiveStatus(`Tamilya consulte : ${event.agents.join(", ")}.`);
            }
            break;
          case "replace":
            // Mode maître : version corrigée de la réponse, à la place du texte reçu en direct.
            reply = event.text;
            updateMessage(assistantId, (m) => ({ ...m, content: event.text }));
            break;
          case "learned": {
            // Mode maître : mots retenus, affichés sous la réponse ; les [[mots]] qu'ils traduisent
            // sont remplacés dans toute la conversation (comme un clic sur le mot orange).
            const table = translationTable(event.words);
            setMessages((current) =>
              current.map((m) =>
                m.id === assistantId
                  ? { ...m, learned: event.words }
                  : m.role === "assistant"
                    ? { ...m, content: fillKnownWords(m.content, table) }
                    : m,
              ),
            );
            break;
          }
          case "remembered":
            updateMessage(assistantId, (m) => ({ ...m, remembered: event.items }));
            break;
          case "done":
            settled = true;
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
        const body = {
          ...(userId
            ? { message: text, ...(conversationId ? { conversationId } : {}) }
            : { message: text, history: buildModelHistory(settledTurns(base), CHAT_LIMITS.anonymousMaxHistoryChars) }),
          ...(spoken ? { voice: true } : {}),
        };

        if (spoken) markVoice("sent");
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
          if (error.code === "signup_required") {
            setTrialOver(true);
            openAuthDialog({ mode: "signup", reason: `Tes ${CHAT_LIMITS.guestTrialMessages} messages d'essai sont utilisés : crée ton compte gratuit pour continuer avec Tamilya.` });
          }
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
              : "Tu es hors ligne. Vérifie ta connexion internet.",
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
        setLiveStatus("Réponse de Tamilya terminée.");
        abortRef.current = null;
        if (controller.signal.aborted) stopVoice();
        else voiceReplied(reply);

        if (userId) refreshConversations();
        // Nouvelle conversation : l'IA lui donne un titre juste après la réponse ; on relit la liste un peu plus tard.
        if (userId && createdConversationId) setTimeout(refreshConversations, 5000);
        // Nouvelle conversation : l'adresse devient /c/<id> sans changer de page (pas de router.replace, qui
        // rechargeait l'écran, faisait clignoter le chargement et remettait à zéro la commande ou le tableau ouverts).
        // Sauf si l'on est passé entre-temps à une nouvelle conversation : l'adresse reste alors celle de la nouvelle.
        if (createdConversationId && !stale()) window.history.replaceState(null, "", `/c/${createdConversationId}`);
      }
    },
    [conversationId, isStreaming, messages, refreshConversations, updateMessage, userId, voiceReplied, voiceSay, stopVoice, openAuthDialog],
  );

  useEffect(() => {
    sendRef.current = (text, spoken) => void send(text, undefined, spoken);
  }, [send]);

  // Échange du vocal en direct : affiché tout de suite, puis enregistré (conversation créée au premier échange).
  const conversationIdRef = useRef(conversationId);
  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);
  // Attestation : formulaire rempli, Tamilya écrit d'elle-même comment faire les signatures.
  // Non enregistré : ce texte est le même pour tous et ne dit rien de la personne.
  useEffect(() => {
    const explain = (event: Event) => {
      // Le bloc de départ sait que la suite est ici et se replie.
      event.preventDefault();
      const id = newId();
      setMessages((previous) => [...previous, { id, role: "assistant", content: SIGNATURE_HELP, status: "streaming" }]);
      // Le message s'écrit lettre à lettre à son arrivée (MessageItem), puis le bloc revient dessous.
      window.setTimeout(() => setMessages((previous) => previous.map((m) => (m.id === id ? { ...m, status: "complete" } : m))), 100);
      window.setTimeout(() => setMessages((previous) => [...previous, { id: newId(), role: "assistant", content: signaturesBlock, status: "complete" }]), SIGNATURES_BLOCK_DELAY_MS);
    };
    window.addEventListener(SIGNATURE_HELP_EVENT, explain);
    return () => window.removeEventListener(SIGNATURE_HELP_EVENT, explain);
  }, []);
  useEffect(() => {
    liveTurnRef.current = (userText, tamilya) => {
      setMessages((previous) => [
        ...previous,
        ...(userText ? [{ id: newId(), role: "user" as const, content: userText, status: "complete" as const }] : []),
        ...(tamilya ? [{ id: newId(), role: "assistant" as const, content: tamilya, status: "complete" as const }] : []),
      ]);
      if (!userId) return;
      const known = conversationIdRef.current;
      void fetch("/api/voice/live/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: userText, tamilya, ...(known ? { conversationId: known } : {}) }),
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ conversationId?: string }>) : null))
        .then((saved) => {
          if (!saved?.conversationId || saved.conversationId === conversationIdRef.current) return;
          conversationIdRef.current = saved.conversationId;
          setConversationId(saved.conversationId);
          window.history.replaceState(null, "", `/c/${saved.conversationId}`);
          refreshConversations();
        })
        .catch(() => {});
    };
  }, [userId, refreshConversations]);

  // Compteur d'essai relu sur l'appareil (localStorage, indisponible au rendu serveur).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!userId) setGuestSent(readGuestSent());
  }, [userId]);

  // Message tapé sur la page d'accueil des visiteurs : envoyé une seule fois, à son arrivée.
  const startedWith = useRef<string | null>(null);
  useEffect(() => {
    if (!startWith || startedWith.current === startWith) return;
    startedWith.current = startWith;
    sendRef.current(startWith);
  }, [startWith]);

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
        void alertDialog({ title: "Enregistrement impossible", message: (await readErrorMessage(res)).message });
        return;
      }
      const data = (await res.json()) as { conversation: { id: string } };
      clearAnonymousDraft();
      setImportCandidate(null);
      refreshConversations();
      router.push(`/c/${data.conversation.id}`);
    } catch {
      void alertDialog({ title: "L'enregistrement a échoué", message: "Vérifie ta connexion." });
    } finally {
      setImporting(false);
    }
  }

  function declineImport() {
    clearAnonymousDraft();
    setImportCandidate(null);
    setMessages([]);
  }

  // Sans compte : 5 messages d'essai en tout, puis compte obligatoire (le serveur le vérifie aussi).
  const guestLeft = Math.max(0, CHAT_LIMITS.guestTrialMessages - guestSent);
  const anonymousLimitReached = !userId && !isStreaming && (trialOver || guestLeft === 0);
  const blocked = limitReached || anonymousLimitReached || importCandidate !== null;
  const suggestions = user?.isAdmin ? [FOOD_SUGGESTION, ...SUGGESTIONS.slice(0, 3)] : SUGGESTIONS;
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
      data-chat-scroll
      // Repère pour cacher le rond d'aide pendant la conversation (voir globals.css).
      data-chat-view=""
      onScroll={(e) => {
        const el = e.currentTarget;
        distanceFromBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickToBottom.current = distanceFromBottom.current < 80;
        const far = distanceFromBottom.current > 400;
        if (far !== showJump) setShowJump(far);
      }}
      // overscroll-contain : l'effet élastique en bout de liste ne fait pas bouger toute la page.
      className={`relative flex h-full min-h-0 flex-col overscroll-contain ${messages.length === 0 ? "overflow-hidden" : "overflow-y-auto"}`}
    >
      {/* z-20 : au-dessus des boutons des messages (copier, écouter : z-10) qui défilent dessous. */}
      <header className="sticky top-0 z-20 flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center gap-2 persona-backdrop border-b border-border px-3 pt-[env(safe-area-inset-top)] md:border-transparent md:px-5">
        <button
          type="button"
          onClick={openSidebar}
          className="zone-appui relative rounded-lg p-2 text-fg-muted hover:bg-bg-muted md:hidden"
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
                    "Crée un compte ou connecte-toi pour enregistrer cette conversation. On te demandera confirmation avant de l'enregistrer.",
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-bg-muted"
            >
              <IconSave width={16} height={16} />
              Enregistrer
            </button>
          ) : null}
          {/* Téléphone : nouvelle conversation sans ouvrir le menu (sur ordinateur, le « + » est dans la barre latérale). */}
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={startNewChat}
              aria-label="Nouvelle conversation"
              className="app-hide rounded-lg p-2 text-fg-muted hover:bg-bg-muted hover:text-fg md:hidden"
            >
              <IconPlus width={22} height={22} />
            </button>
          ) : null}
          {/* Notifications : livraisons, paiements, réservations (compte connecté). */}
          {userId ? <NotificationBell /> : null}
        </div>
      </header>

      <div ref={contentRef} className={`flex flex-1 flex-col ${messages.length === 0 ? "min-h-0" : "shrink-0"}`}>
        {messages.length === 0 ? (
          // Accueil : Tamilya (globe animé) au centre, suggestions juste au-dessus de la zone de saisie, collée en bas.
          <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col px-4 sm:px-6">
            {/* Le haut se resserre sur les petits écrans (le globe disparaît s'il manque de hauteur) au lieu de déborder. */}
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden py-3 text-center sm:py-8">
              {/* Tamilya vivante : un clic l'anime puis ouvre la voix (admin) ou la zone de saisie. */}
              <AwaBlob
                label={voiceEnabled ? "Parler à Tamilya" : "Écrire à Tamilya"}
                onActivate={voiceEnabled && !blocked && online ? voice.start : () => composerRef.current?.focus()}
                // Pendant le mode vocal, ce même globe est au centre de l'écran (morphose) : ici, il s'efface.
                className={`awa-blob-home shrink-0 [@media(max-height:560px)]:hidden ${voice.state !== "off" || voice.choosing ? "is-away" : ""}`}
              />
              <h1 suppressHydrationWarning className="awa-hello-rise mt-5 text-2xl font-semibold tracking-tight sm:mt-8 sm:text-4xl [@media(max-height:560px)]:mt-0">
                {greeting()}
                {user?.displayName ? `, ${user.displayName}` : ""}
              </h1>
              <p className="awa-hello-rise mt-2 max-w-xs text-sm text-fg-muted [animation-delay:120ms] sm:max-w-none sm:text-base">
                Je suis Tamilya. Pose-moi ta question, en français ou en shimaoré.
              </p>
            </div>

            {/* Téléphone : une idée à la fois, en carrousel. */}
            <div className="shrink-0 sm:hidden">
              <SuggestionCarousel items={suggestions} disabled={blocked || !online} onPick={(text) => void send(text)} />
            </div>
            <ul className="hidden shrink-0 grid-cols-2 gap-3 pb-3 sm:grid" aria-label="Idées pour commencer">
              {suggestions.map((s, i) => (
                <li key={s.title} className="awa-hello-rise" style={{ animationDelay: `${200 + i * 70}ms` }}>
                  <button
                    type="button"
                    disabled={blocked || !online}
                    onClick={() => void send(s.text)}
                    className="group flex h-full w-full items-center gap-2.5 rounded-2xl border border-border bg-bg/60 p-2.5 text-left backdrop-blur transition sm:gap-3 hover:-translate-y-0.5 hover:border-[var(--persona-border,var(--border))] hover:bg-[var(--persona-surface,var(--bg-subtle))] hover:shadow-[0_10px_30px_-14px_var(--persona,var(--accent))] disabled:opacity-50 sm:p-4"
                  >
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-xl bg-[var(--persona-soft,var(--bg-muted))] text-lg transition group-hover:scale-110 sm:size-10 sm:text-xl"
                    >
                      <Pictogram of={s.emoji} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{s.title}</span>
                      <span className="block truncate text-xs text-fg-muted">{s.hint}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <section aria-label="Conversation" className="mx-auto w-full max-w-3xl space-y-10 px-3.5 pt-4 pb-10 sm:px-6 sm:pt-6 sm:pb-12">
            <TeachWordContext value={user?.isAdmin ? teachWord : null}>
              <CorrectContext value={user?.isAdmin ? correctPassage : null}>
                {messages.map((message, index) => (
                  <MessageItem
                    key={message.id}
                    message={message}
                    question={message.role === "assistant" ? questionBefore(messages, index) : undefined}
                    onRetry={message.id === retryTargetId ? retryLast : undefined}
                  />
                ))}
              </CorrectContext>
            </TeachWordContext>
          </section>
        )}
      </div>

      {/* Fondu vers la teinte de la conversation : les messages passent dessous en douceur. */}
      <div
        className={`composer-dock sticky bottom-0 z-10 shrink-0 px-2.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] ${
          messages.length === 0 ? "pt-1" : "bg-[linear-gradient(to_top,var(--persona-surface,var(--bg))_80%,transparent)] pt-4"
        }`}
      >
        {/* Revenir en bas après avoir remonté la conversation. */}
        {showJump && messages.length > 0 ? (
          <button
            type="button"
            onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
            aria-label="Revenir en bas de la conversation"
            className="absolute -top-10 left-1/2 grid size-9 -translate-x-1/2 place-items-center rounded-full border border-border bg-bg text-fg-muted shadow-lg transition hover:text-fg"
          >
            <IconArrowDown width={18} height={18} />
          </button>
        ) : null}
        <div className="mx-auto w-full max-w-3xl space-y-2">
          {!online ? (
            <p role="status" className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm">
              <IconOffline width={16} height={16} />
              Tu es hors ligne. Tes messages pourront être envoyés au retour de la connexion.
            </p>
          ) : null}

          {importCandidate ? (
            <div role="region" aria-label="Enregistrer la conversation" className="rounded-xl border border-border bg-accent-soft p-4 text-sm">
              <p className="font-medium">Enregistrer la conversation commencée avant ta connexion ?</p>
              <p className="mt-1 text-fg-muted">
                Elle sera ajoutée à ton compte et tu pourras la poursuivre. Si tu refuses, elle sera effacée de
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

          {anonymousLimitReached ? (
            // Fin de l'essai : seul un compte permet de continuer (une nouvelle conversation ne remet pas le compteur à zéro).
            <div role="status" className="trial-over flex flex-col items-center gap-3 rounded-2xl border border-[var(--persona-border,var(--border))] bg-[var(--persona-surface,var(--bg-subtle))] p-5 text-center sm:flex-row sm:text-left">
              <span aria-hidden="true" className="text-3xl">
                <Flower2 size="1em" strokeWidth={1.8} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Tu as utilisé tes {CHAT_LIMITS.guestTrialMessages} messages d&apos;essai</p>
                <p className="mt-0.5 text-sm text-fg-muted">Crée ton compte gratuit pour continuer avec Tamilya et retrouver tes conversations.</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => openAuthDialog({ mode: "signin" })}
                  className="rounded-full border border-border bg-bg px-4 py-2 text-sm font-medium hover:bg-bg-muted"
                >
                  Se connecter
                </button>
                <button
                  type="button"
                  onClick={() => openAuthDialog({ mode: "signup", reason: "Crée ton compte gratuit pour continuer avec Tamilya." })}
                  className="rounded-full bg-[var(--persona,var(--accent))] px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                >
                  Créer mon compte
                </button>
              </div>
            </div>
          ) : limitReached ? (
            <div role="status" className="rounded-xl border border-border bg-bg-subtle p-4 text-sm">
              <p className="font-medium">Cette conversation a atteint sa longueur maximale.</p>
              <p className="mt-1 text-fg-muted">Démarre une nouvelle conversation pour continuer.</p>
            </div>
          ) : null}

          {voiceEnabled && voice.error ? (
            <p role="alert" className="mb-2 text-center text-sm text-danger">
              {voice.error}
            </p>
          ) : null}
          {/* Le + (documents, cyclones, attestation, livres : /admin/fonctionnalites) flotte à gauche de la barre, dans sa propre bulle. */}
          <div className="flex items-end gap-2">
            {user ? <PlusMenu features={user.features ?? []} isAdmin={Boolean(user.isAdmin)} disabled={blocked || !online || isStreaming} onAsk={(text) => void send(text)} /> : null}
            <div className="min-w-0 flex-1">
              <Composer
                ref={composerRef}
                isStreaming={isStreaming}
                disabled={blocked || !online}
                disabledReason={!online ? "Hors ligne" : importCandidate ? "Choisis d'abord ci-dessus" : "Conversation terminée"}
                onSend={(text) => {
                  // « Chante », « dis-le à voix haute » : le vocal s'ouvre tout seul et elle répond à voix haute.
                  // Sauf juste après une histoire collée : « dis-le à voix haute » lance la lecture en 3D (voix et bruits).
                  const asked = messages.filter((m) => m.role === "user").map((m) => m.content).reverse();
                  // « Lis-moi une histoire » aussi : Tamilya l'invente et la joue en 3D, plutôt que de la dire en vocal simple.
                  const reading = Boolean(user?.isAdmin) && readingMode(text, asked) !== null;
                  if (!reading && voiceEnabled && online && voice.startWith && wantsSpokenReply(text)) voice.startWith(text, () => sendRef.current(text));
                  else void send(text);
                }}
                onStop={() => abortRef.current?.abort()}
                placeholder="Demande-moi ce que tu veux…"
                // Conversation vide : des exemples défilent pour montrer ce que Tamilya sait faire ; ensuite, le texte reste fixe.
                examples={messages.length === 0 ? [...(user?.isAdmin ? [FOOD_EXAMPLE] : []), ...EXAMPLES] : undefined}
                trailing={
                  voiceEnabled ? (
                    <button
                      type="button"
                      onClick={voice.start}
                      disabled={blocked || !online || isStreaming}
                      aria-label="Parler à Tamilya"
                      title="Parler à Tamilya"
                      className="grid size-9 shrink-0 place-items-center rounded-full text-fg-muted transition pointer-coarse:size-10 hover:bg-bg-muted hover:text-fg disabled:opacity-45"
                    >
                      <IconMic />
                    </button>
                  ) : null
                }
              />
            </div>
          </div>
          {!userId && !anonymousLimitReached && guestSent > 0 ? (
            <p className="text-center text-[11px] text-fg-muted">
              Encore {guestLeft} message{guestLeft > 1 ? "s" : ""} sans compte ·{" "}
              <button
                type="button"
                onClick={() => openAuthDialog({ mode: "signup", reason: "Crée ton compte gratuit pour continuer à parler avec Tamilya." })}
                className="font-semibold text-[var(--persona,var(--accent))] hover:underline"
              >
                Créer mon compte gratuit
              </button>
            </p>
          ) : (
            <p className="text-center text-[11px] text-fg-muted">Tamilya peut se tromper. Vérifie les informations importantes.</p>
          )}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {liveStatus}
      </p>
      {voiceEnabled ? <VoiceOverlay voice={voice} /> : null}
    </div>
  );
}

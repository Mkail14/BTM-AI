"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  personaStyle,
  PersonalityProvider,
  useCurrentPersonality,
} from "@/components/personality/PersonalityContext";
import { PersonalityDialog } from "@/components/personality/PersonalityDialog";
import type { PersonalityCard } from "@/lib/ai/personalities";
import { clearAnonymousDraft } from "@/lib/chat/anonymous-draft";
import type { ConversationSummary } from "@/lib/chat/types";
import { Sidebar } from "./Sidebar";
import { useKeyboardViewport } from "./useKeyboardViewport";

type ChatShellValue = {
  conversations: ConversationSummary[];
  conversationsLoading: boolean;
  refreshConversations: () => void;
  /** Incrémenté à chaque demande de nouvelle conversation. */
  newChatSignal: number;
  startNewChat: () => void;
  openSidebar: () => void;
};

const ChatShellContext = createContext<ChatShellValue | null>(null);

export function useChatShell() {
  const value = use(ChatShellContext);
  if (!value) throw new Error("useChatShell doit être utilisé dans <ChatShell>.");
  return value;
}

export function ChatShell({
  children,
  personalityCards,
}: {
  children: ReactNode;
  personalityCards: PersonalityCard[];
}) {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [newChatSignal, setNewChatSignal] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const userId = user?.id ?? null;
  const frameRef = useRef<HTMLDivElement>(null);
  useKeyboardViewport(frameRef);

  // Liste des conversations : uniquement pour un utilisateur connecté.
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    (async () => {
      setConversationsLoading(true);
      try {
        const res = await fetch("/api/conversations", { signal: controller.signal, cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as { conversations: ConversationSummary[] };
          setConversations(data.conversations);
        }
      } catch {
        // Réseau indisponible : la liste sera rechargée plus tard.
      } finally {
        if (!controller.signal.aborted) setConversationsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [userId, refreshToken]);

  const refreshConversations = useCallback(() => setRefreshToken((n) => n + 1), []);

  const startNewChat = useCallback(() => {
    if (!userId) clearAnonymousDraft();
    setNewChatSignal((n) => n + 1);
    setSidebarOpen(false);
    if (pathname !== "/") router.push("/");
  }, [pathname, router, userId]);

  // Raccourci : Ctrl/⌘ + Maj + O pour une nouvelle conversation.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        startNewChat();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [startNewChat]);

  const value = useMemo(
    () => ({
      conversations: userId ? conversations : [],
      conversationsLoading,
      refreshConversations,
      newChatSignal,
      startNewChat,
      openSidebar: () => setSidebarOpen(true),
    }),
    [userId, conversations, conversationsLoading, refreshConversations, newChatSignal, startNewChat],
  );

  return (
    <ChatShellContext value={value}>
      <PersonalityProvider>
        {/* Fixe et calé sur la zone visible : le clavier du téléphone ne fait plus glisser la page. */}
        <div
          ref={frameRef}
          className="fixed top-0 right-[env(safe-area-inset-right)] left-[env(safe-area-inset-left)] flex h-dvh overflow-hidden"
        >
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
          <PersonaMain>{children}</PersonaMain>
        </div>
        <PersonalityDialog cards={personalityCards} />
      </PersonalityProvider>
    </ChatShellContext>
  );
}

/**
 * Zone de conversation teintée par la personnalité d'Awa (fond, halo, filet en
 * haut). La barre latérale reste neutre : seule la conversation change d'ambiance.
 */
function PersonaMain({ children }: { children: ReactNode }) {
  const { current } = useCurrentPersonality();
  return (
    <main
      id="contenu"
      data-persona={current}
      style={personaStyle(current)}
      className="persona-surface relative flex min-w-0 flex-1 flex-col"
    >
      <div aria-hidden="true" className="persona-line pointer-events-none absolute inset-x-0 top-0 z-20 h-0.5" />
      {children}
    </main>
  );
}

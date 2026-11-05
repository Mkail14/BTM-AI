"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createStreamEventParser } from "@/lib/chat/stream-protocol";
import type { ChatStreamEvent } from "@/lib/chat/types";
import { useLiveVoiceConversation } from "./useLiveVoiceConversation";
import { useVoiceConversation } from "./useVoiceConversation";
import { VoiceOverlay } from "./VoiceOverlay";

async function errorMessage(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    if (data.error?.message) return data.error.message;
  } catch {
    // Corps non JSON.
  }
  return "Je n'arrive pas à répondre pour l'instant. Réessaie.";
}

/**
 * Page /voix : seulement le globe. Les échanges partent dans une conversation
 * enregistrée comme les autres (historique, mémoire, shimaoré appris), mais
 * rien ne s'affiche à part Tamilya qui écoute et qui parle.
 */
export function VoiceRoom() {
  const router = useRouter();
  const conversationId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const repliedRef = useRef<(text: string) => void>(() => {});
  const sayRef = useRef<(text: string) => void>(() => {});

  async function ask(text: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    let reply = "";
    const handle = (event: ChatStreamEvent) => {
      if (event.type === "meta") conversationId.current = event.conversationId;
      else if (event.type === "delta") reply += event.text;
      else if (event.type === "replace") reply = event.text;
      // Phrase terminée : Tamilya la dit tout de suite, pendant que la suite s'écrit.
      else if (event.type === "speech") sayRef.current(event.text);
      else if (event.type === "error" && !reply) reply = event.message;
    };
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, voice: true, ...(conversationId.current ? { conversationId: conversationId.current } : {}) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        reply = await errorMessage(res);
      } else {
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        const parser = createStreamEventParser();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.push(value).forEach(handle);
        }
        parser.flush().forEach(handle);
      }
    } catch {
      if (controller.signal.aborted) return;
      reply = "La connexion a été coupée. Réessaie.";
    }
    repliedRef.current(reply);
  }

  const legacyVoice = useVoiceConversation((text) => void ask(text));
  // Vocal en direct (Gemini Live) : chaque échange est enregistré dans la même conversation.
  const liveVoice = useLiveVoiceConversation((user, tamilya) => {
    void fetch("/api/voice/live/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, tamilya, ...(conversationId.current ? { conversationId: conversationId.current } : {}) }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ conversationId?: string }>) : null))
      .then((saved) => {
        if (saved?.conversationId) conversationId.current = saved.conversationId;
      })
      .catch(() => {});
  });
  const voice = liveVoice.supported ? liveVoice : legacyVoice;
  useEffect(() => {
    repliedRef.current = legacyVoice.replied;
    sayRef.current = legacyVoice.say;
  }, [legacyVoice.replied, legacyVoice.say]);
  useEffect(() => () => abortRef.current?.abort(), []);

  return <VoiceOverlay voice={voice} standalone onClose={() => router.push("/admin")} />;
}

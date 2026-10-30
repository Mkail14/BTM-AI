"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { createStreamEventParser } from "@/lib/chat/stream-protocol";
import type { ChatStreamEvent } from "@/lib/chat/types";
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
 * rien ne s'affiche à part Awa qui écoute et qui parle.
 */
export function VoiceRoom() {
  const router = useRouter();
  const conversationId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const repliedRef = useRef<(text: string) => void>(() => {});

  async function ask(text: string) {
    const controller = new AbortController();
    abortRef.current = controller;
    let reply = "";
    const handle = (event: ChatStreamEvent) => {
      if (event.type === "meta") conversationId.current = event.conversationId;
      else if (event.type === "delta") reply += event.text;
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

  const voice = useVoiceConversation((text) => void ask(text));
  useEffect(() => {
    repliedRef.current = voice.replied;
  }, [voice.replied]);
  useEffect(() => () => abortRef.current?.abort(), []);

  return <VoiceOverlay voice={voice} standalone onClose={() => router.push("/admin")} />;
}

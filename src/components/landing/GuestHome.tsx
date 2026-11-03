"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ChatView } from "@/components/chat/ChatView";
import { loadAnonymousDraft } from "@/lib/chat/anonymous-draft";
import type { PublicReview } from "@/lib/reviews/rules";
import type { Announcement } from "@/lib/site/announcement-rules";
import { GuestLanding } from "./GuestLanding";

/** Durée du fondu de la page d'accueil vers la conversation (voir .landing[data-leaving]). */
const LEAVE_MS = 560;
/** Temps laissé à la conversation pour afficher le message avant la morphose. */
const MORPH_SETTLE_MS = 90;

type Phase = "landing" | "leaving" | "chat";

/**
 * Accueil des visiteurs sans compte : la page de présentation de Tamilya par-dessus
 * la conversation. Quand on lui parle, le message part tout de suite et la
 * page d'accueil s'efface en douceur sur la conversation.
 */
export function GuestHome({ reviews, announcement }: { reviews: PublicReview[]; announcement: Announcement | null }) {
  const [phase, setPhase] = useState<Phase>("landing");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    // Conversation d'essai déjà commencée sur cet appareil (localStorage) : proposée en reprise.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasDraft((loadAnonymousDraft()?.length ?? 0) > 0);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);

  // Pendant la page d'accueil, la page du dessous ne défile pas.
  useEffect(() => {
    if (phase === "chat") return;
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, [phase]);

  const go = (message: string | null) => {
    if (phase !== "landing") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPrompt(message);
      setPhase("chat");
      return;
    }
    // Morphose (voir html[data-morph] dans globals.css) : le champ de l'accueil
    // devient la zone de saisie de la conversation pendant que la page se dissout.
    if (typeof document.startViewTransition === "function") {
      const html = document.documentElement;
      html.dataset.morph = "depart";
      const transition = document.startViewTransition(async () => {
        html.dataset.morph = "arrivee";
        flushSync(() => {
          setPrompt(message);
          setPhase("chat");
        });
        // Le message part tout de suite : on laisse la conversation se placer (saisie en bas).
        await new Promise((resolve) => window.setTimeout(resolve, MORPH_SETTLE_MS));
      });
      void transition.finished.finally(() => delete html.dataset.morph);
      return;
    }
    setPrompt(message);
    setPhase("leaving");
    timer.current = window.setTimeout(() => setPhase("chat"), LEAVE_MS);
  };

  return (
    <>
      <ChatView key="accueil" conversationId={null} initialMessages={[]} startWith={prompt} />
      {phase !== "chat" ? (
        <GuestLanding
          reviews={reviews}
          announcement={announcement}
          leaving={phase === "leaving"}
          hasDraft={hasDraft}
          onStart={(text) => go(text)}
          onResume={() => go(null)}
        />
      ) : null}
    </>
  );
}

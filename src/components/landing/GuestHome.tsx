"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChatView } from "@/components/chat/ChatView";
import { loadAnonymousDraft } from "@/lib/chat/anonymous-draft";
import type { AwaProgress } from "@/lib/landing/progress";
import { GuestLanding } from "./GuestLanding";

/** Durées de la transition : la vague couvre l'écran, puis se retire sur la conversation. */
const COVER_MS = 650;
const REVEAL_MS = 700;

type Phase = "landing" | "cover" | "reveal" | "chat";

/**
 * Accueil des visiteurs sans compte : la page de présentation d'Awa par-dessus
 * la conversation. Quand on lui parle, une vague aux couleurs d'Awa part du
 * champ, couvre l'écran puis se retire sur la conversation, où le message part
 * tout seul.
 */
export function GuestHome({ progress }: { progress: AwaProgress }) {
  const [phase, setPhase] = useState<Phase>("landing");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [hasDraft, setHasDraft] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    // Conversation d'essai déjà commencée sur cet appareil (localStorage) : proposée en reprise.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasDraft((loadAnonymousDraft()?.length ?? 0) > 0);
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
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

  const go = (message: string | null, from: { x: number; y: number }) => {
    if (phase !== "landing") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setPrompt(message);
      setPhase("chat");
      return;
    }
    setOrigin(from);
    setPhase("cover");
    timers.current.push(
      window.setTimeout(() => {
        setPrompt(message);
        setPhase("reveal");
      }, COVER_MS),
      window.setTimeout(() => setPhase("chat"), COVER_MS + REVEAL_MS),
    );
  };

  const waveStyle = { "--wave-x": `${origin.x}px`, "--wave-y": `${origin.y}px` } as CSSProperties;

  return (
    <>
      <ChatView key="accueil" conversationId={null} initialMessages={[]} startWith={prompt} />
      {phase === "landing" || phase === "cover" ? (
        <GuestLanding
          progress={progress}
          leaving={phase === "cover"}
          hasDraft={hasDraft}
          onStart={(text, from) => go(text, from)}
          onResume={(from) => go(null, from)}
        />
      ) : null}
      {phase === "cover" || phase === "reveal" ? <div aria-hidden="true" data-phase={phase} className="landing-wave" style={waveStyle} /> : null}
    </>
  );
}

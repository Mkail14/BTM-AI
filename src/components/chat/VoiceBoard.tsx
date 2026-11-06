"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { registerBoard } from "@/lib/voice-live/stage";

/**
 * Tableau que Tamilya peut piloter à la voix (lib/voice-live/board.ts). Il vit dans
 * un hôte que le vocal peut déplacer au centre de l'écran sans le recréer : le panier
 * et les choix en cours restent intacts (lib/voice-live/stage.ts).
 */
export function VoiceBoard({ children }: { children: ReactNode }) {
  const home = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const place = home.current;
    if (!place) return;
    const created = document.createElement("div");
    created.setAttribute("data-voice-board", "");
    place.appendChild(created);
    registerBoard(created, place);
    // L'hôte n'existe qu'une fois la page affichée.
    setHost(created);
    return () => created.remove();
  }, []);

  return <div ref={home}>{host ? createPortal(children, host) : null}</div>;
}

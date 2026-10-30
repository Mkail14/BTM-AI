"use client";

import { useCallback, useEffect, useRef } from "react";
import { IconClose, IconMic } from "@/components/ui/icons";
import { speakableText } from "@/lib/chat/voice";
import { splitUnknownWords } from "@/lib/language/unknown-words";
import type { VoiceConversation } from "./useVoiceConversation";

const LABELS = {
  off: "Touche le globe pour me parler",
  listening: "Je t'écoute…",
  waiting: "Je réfléchis…",
  speaking: "Touche le globe pour me couper",
} as const;

/**
 * Mode vocal plein écran : le globe d'Awa écoute, réfléchit et parle.
 * Il pulse à chaque mot entendu ou prononcé.
 * `standalone` (page /voix) : toujours affiché, le globe au repos attend qu'on le touche.
 */
export function VoiceOverlay({
  voice,
  standalone = false,
  onClose,
}: {
  voice: VoiceConversation;
  standalone?: boolean;
  /** Après l'arrêt (bouton ✕ ou Échap). */
  onClose?: () => void;
}) {
  const orbRef = useRef<HTMLButtonElement>(null);
  const { state, beat, transcript, reply, error, start, interrupt } = voice;
  const stopVoice = voice.stop;
  const talk = state === "off" ? start : interrupt;
  const close = useCallback(() => {
    stopVoice();
    onClose?.();
  }, [onClose, stopVoice]);

  // Pulsation : le globe grossit d'un coup puis revient doucement.
  useEffect(() => {
    const orb = orbRef.current;
    if (!orb || beat === 0) return;
    orb.style.setProperty("--orb-pulse", String(1.06 + Math.random() * 0.06));
    const timer = window.setTimeout(() => orb.style.setProperty("--orb-pulse", "1"), 140);
    return () => window.clearTimeout(timer);
  }, [beat]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  if (state === "off" && !standalone) return null;
  // Réponse d'Awa : les [[mots français]] (ceux qu'elle ne connaît pas encore en shimaoré) en couleur.
  const text =
    state === "speaking"
      ? splitUnknownWords(reply).map((segment, index) =>
          segment.french ? (
            <mark key={index} className="rounded bg-amber-300/20 px-1 font-medium text-amber-300">
              {segment.text}
            </mark>
          ) : (
            <span key={index}>{speakableText(segment.text)} </span>
          ),
        )
      : state === "listening"
        ? transcript
        : "";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Conversation vocale avec Awa"
      className="voice-overlay fixed inset-0 z-[60] flex flex-col items-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-white"
    >
      <p className="text-sm font-medium tracking-[0.3em] text-white/50 uppercase">Awa</p>

      <div className="flex w-full flex-1 flex-col items-center justify-center gap-10">
        <button
          ref={orbRef}
          type="button"
          onClick={talk}
          data-state={state}
          aria-label={state === "speaking" ? "Couper Awa et parler" : "Parler"}
          className="voice-orb"
        >
          <span className="voice-orb__halo" aria-hidden="true" />
          <span className="voice-orb__ring" aria-hidden="true" />
          <span className="voice-orb__ring voice-orb__ring--outer" aria-hidden="true" />
          <span className="voice-orb__core" aria-hidden="true">
            <span className="voice-orb__swirl" />
          </span>
        </button>

        <div className="w-full max-w-xl text-center" aria-live="polite">
          <p className={`text-base font-medium ${error && state === "off" ? "text-red-300" : "text-white/80"}`}>
            {error && state === "off" ? error : LABELS[state]}
          </p>
          <p className="mt-3 line-clamp-4 min-h-[3lh] text-lg leading-relaxed text-white/60">{text}</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button
          type="button"
          onClick={talk}
          aria-label="Parler maintenant"
          className={`grid size-14 place-items-center rounded-full transition ${
            state === "listening" ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"
          }`}
        >
          <IconMic width={24} height={24} />
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Terminer la conversation vocale"
          className="grid size-14 place-items-center rounded-full bg-danger text-white transition hover:brightness-110"
        >
          <IconClose width={24} height={24} />
        </button>
      </div>
    </div>
  );
}

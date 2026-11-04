"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { AwaBlob, takeLaunchOrigin } from "./AwaBlob";
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
 * Mode vocal plein écran : le globe de Tamilya écoute, réfléchit et parle.
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
  const { state, transcript, reply, error, hint, start, interrupt } = voice;
  const stopVoice = voice.stop;
  const talk = state === "off" ? start : interrupt;
  const close = useCallback(() => {
    stopVoice();
    onClose?.();
  }, [onClose, stopVoice]);

  const visible = state !== "off" || standalone;
  const overlay = useRef<HTMLDivElement>(null);
  const orb = useRef<HTMLDivElement>(null);

  /*
   * Morphose à l'ouverture : le globe de l'accueil glisse et grandit jusqu'au
   * centre (il part exactement de là où on l'a touché), pendant que la page
   * s'assombrit et se floute derrière lui, sans voile qui couvre d'un coup.
   * Le texte et les boutons arrivent ensuite.
   */
  useLayoutEffect(() => {
    if (!visible) return;
    const from = takeLaunchOrigin();
    const el = orb.current;
    if (!from || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const k = from.width / to.width;
    overlay.current?.setAttribute("data-morph", "");
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${k})` },
        { transform: `translate(${dx * 0.15}px, ${dy * 0.15}px) scale(${1.06})`, offset: 0.7 },
        { transform: "none" },
      ],
      { duration: 820, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    overlay.current?.style.setProperty("--morph-x", `${from.left + from.width / 2}px`);
    overlay.current?.style.setProperty("--morph-y", `${from.top + from.height / 2}px`);
  }, [visible]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  if (state === "off" && !standalone) return null;
  // Réponse de Tamilya : les [[mots français]] (ceux qu'elle ne connaît pas encore en shimaoré) en couleur.
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
        ? transcript || hint
        : "";

  return (
    <div
      ref={overlay}
      role="dialog"
      aria-modal="true"
      aria-label="Conversation vocale avec Tamilya"
      className="voice-overlay fixed inset-0 z-[60] flex flex-col items-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-white"
    >
      <p className="voice-morph-in text-sm font-medium tracking-[0.3em] text-white/50 uppercase">Tamilya</p>

      <div className="flex w-full flex-1 flex-col items-center justify-center gap-10">
        {/* La même Tamilya que sur l'accueil, en grand : elle suit sa voix quand elle parle, frémit quand on lui parle. */}
        <div ref={orb}>
          <AwaBlob
            label={state === "speaking" ? "Couper Tamilya et parler" : "Parler"}
            onActivate={talk}
            immediate
            busy={state === "waiting"}
            size="min(60vw, 16rem)"
            goo={13}
          />
        </div>

        <div className="voice-morph-in w-full max-w-xl text-center [animation-delay:380ms]" aria-live="polite">
          <p className={`text-base font-medium ${error && state === "off" ? "text-red-300" : "text-white/80"}`}>
            {error && state === "off" ? error : LABELS[state]}
          </p>
          <p className="mt-3 line-clamp-4 min-h-[3lh] text-lg leading-relaxed text-white/60">{text}</p>
        </div>
      </div>

      <div className="voice-morph-in flex items-center gap-6 [animation-delay:480ms]">
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

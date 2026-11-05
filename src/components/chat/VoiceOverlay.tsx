"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AwaBlob, takeLaunchOrigin } from "./AwaBlob";
import { IconClose, IconMic } from "@/components/ui/icons";
import { speakableText } from "@/lib/chat/voice";
import { splitUnknownWords } from "@/lib/language/unknown-words";
import { TALK_MODES } from "@/lib/voice-live/talk-mode";
import type { VoiceConversation } from "./useVoiceConversation";
import { VoicePay } from "./VoicePay";

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
 * Dès qu'elle ouvre un tableau (`voice.board`), le globe rétrécit et monte en haut, le
 * fond sombre s'efface et on touche le tableau au travers : Tamilya reste là jusqu'à
 * la fin de l'appel, entourée de son anneau arc-en-ciel.
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
  const { state, transcript, reply, error, hint, debug, start, interrupt, live, press, release, handsFree, choosing, choose, board } = voice;
  const compact = Boolean(board);
  // Talkie-walkie (vocal direct) : bouton maintenu.
  const [holding, setHolding] = useState(false);
  const holdStart = () => {
    if (!press || state === "off") return;
    setHolding(true);
    press();
  };
  const holdEnd = () => {
    if (!holding) return;
    setHolding(false);
    release?.();
  };
  const stopVoice = voice.stop;
  const talk = state === "off" ? start : interrupt;
  const close = useCallback(() => {
    stopVoice();
    onClose?.();
  }, [onClose, stopVoice]);

  const visible = state !== "off" || standalone || choosing;
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

  /*
   * Un tableau s'ouvre : le globe glisse du centre vers le haut en rétrécissant.
   * Il change de place d'un coup, l'animation part de son ancienne place.
   */
  const orbRect = useRef<DOMRect | null>(null);
  useLayoutEffect(() => {
    const [el, from] = [orb.current, orbRect.current];
    if (!el || !from || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(${from.width / to.width})` }, { transform: "none" }], {
      duration: 700,
      easing: "cubic-bezier(0.34, 1.3, 0.64, 1)",
    });
  }, [compact]);
  useLayoutEffect(() => {
    orbRect.current = orb.current?.getBoundingClientRect() ?? null;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  if (!visible) return null;
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
      aria-modal={!compact}
      aria-label="Conversation vocale avec Tamilya"
      data-compact={compact || undefined}
      className="voice-overlay fixed inset-0 z-[60] flex flex-col items-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-white"
    >
      <p className="voice-title voice-morph-in text-sm font-medium tracking-[0.3em] text-white/50 uppercase">Tamilya</p>

      <div className={`voice-middle flex w-full flex-1 flex-col items-center justify-center ${choosing ? "gap-6" : "gap-10"}`}>
        {/* La même Tamilya que sur l'accueil, en grand : elle suit sa voix quand elle parle, frémit quand on lui parle. */}
        <div ref={orb} className="voice-orb-slot" data-state={state}>
          <span aria-hidden="true" className="voice-halo" />
          <AwaBlob
            label={state === "speaking" ? "Couper Tamilya et parler" : "Parler"}
            onActivate={talk}
            immediate
            busy={state === "waiting"}
            size={compact ? "min(26vw, 6.5rem)" : "min(60vw, 16rem)"}
            goo={compact ? 5 : 13}
          />
        </div>

        {choosing ? (
          <div className="voice-morph-in w-full max-w-xl text-center [animation-delay:380ms]">
            <p className="text-lg font-medium">Comment veux-tu me parler ?</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {TALK_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => choose?.(mode.id)}
                  className="rounded-2xl bg-white/10 p-3 text-left transition hover:bg-white/20 sm:p-4"
                >
                  <span className="block text-sm font-medium">{mode.title}</span>
                  <span className="mt-1 block text-xs leading-snug text-white/60">{mode.detail}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-white/50">Tu pourras changer dans les paramètres, rubrique Tamilya.</p>
          </div>
        ) : live ? (
          // Vocal direct : écran épuré, le globe seul (le texte n'apparaît qu'en cas d'erreur).
          <div className="voice-morph-in min-h-[3lh] w-full max-w-xl text-center [animation-delay:380ms]" aria-live="polite">
            {error && state === "off" ? <p className="voice-error text-base font-medium text-red-300">{error}</p> : null}
            <span className="sr-only">{LABELS[state]}</span>
          </div>
        ) : (
          <div className="voice-morph-in w-full max-w-xl text-center [animation-delay:380ms]" aria-live="polite">
            <p className={`text-base font-medium ${error && state === "off" ? "text-red-300" : "text-white/80"}`}>
              {error && state === "off" ? error : LABELS[state]}
            </p>
            <p className="mt-3 line-clamp-4 min-h-[3lh] text-lg leading-relaxed text-white/60">{text}</p>
            {/* Diagnostic de l'écoute (le mode vocal n'est ouvert qu'aux administrateurs). */}
            {debug ? <p className="mt-2 text-xs text-white/35 tabular-nums">{debug}</p> : null}
          </div>
        )}
      </div>

      {/* Paiement par Tamilya : avertissement puis code, au-dessus des boutons. */}
      <VoicePay />
      <div className="voice-controls voice-morph-in flex items-center gap-6 [animation-delay:480ms]">
        {choosing || (live && handsFree) ? null : live ? (
          // Talkie-walkie : maintenir pour parler, relâcher pour que Tamilya réponde tout de suite.
          <button
            type="button"
            aria-label="Maintenir pour parler (talkie-walkie)"
            aria-pressed={holding}
            disabled={state === "off"}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              holdStart();
            }}
            onPointerUp={holdEnd}
            onPointerCancel={holdEnd}
            onLostPointerCapture={holdEnd}
            onKeyDown={(event) => {
              if ((event.key === " " || event.key === "Enter") && !event.repeat) holdStart();
            }}
            onKeyUp={(event) => {
              if (event.key === " " || event.key === "Enter") holdEnd();
            }}
            onContextMenu={(event) => event.preventDefault()}
            // iPhone : pas de loupe ni de menu à l'appui long.
            style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none" }}
            className={`voice-mic grid size-20 touch-none select-none place-items-center rounded-full transition disabled:opacity-40 ${
              holding ? "scale-110 bg-white text-black" : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            <IconMic width={30} height={30} />
          </button>
        ) : (
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
        )}
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

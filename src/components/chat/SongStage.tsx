"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/ui/icons";
import { getServerSong, getSong, songProgress, stopSong, subscribeSong, toggleSong } from "@/lib/music/song-stage";
import { TamilyaBlob } from "./TamilyaBlob";
import { useLeavingStage } from "./stage-fade";

/**
 * Le grand globe de Tamilya qui chante, en plein écran comme les histoires. Monté une seule fois
 * (layout). Il bouge pendant qu'elle compose, des messages font patienter dessous, puis il gonfle
 * au rythme de la musique. Toucher le globe : pause ; la croix : stop.
 */
export function SongStage() {
  const { active: current } = useSyncExternalStore(subscribeSong, getSong, getServerSong);
  const { shown: active, leaving } = useLeavingStage(current);
  if (!active || typeof document === "undefined") return null;
  const playing = active.status === "playing";
  const label =
    active.status === "ready" ? "Écouter la chanson" : active.status === "paused" ? "Reprendre la chanson" : playing ? "Mettre la chanson en pause" : "Tamilya compose";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tamilya chante"
      data-leaving={leaving ? "" : undefined}
      className="voice-overlay stage-swap fixed inset-0 z-[60] flex flex-col items-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-white"
    >
      {/* Même fond que le vocal : on passe de l'un à l'autre sans voir de différence. */}
      <span aria-hidden="true" className="voice-aurora" />
      <p className="text-sm font-medium tracking-[0.3em] text-white/50 uppercase">Tamilya</p>
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-6">
        <TamilyaBlob label={label} onActivate={toggleSong} immediate busy={active.status === "preparing"} size="min(60vw, 16rem)" goo={13} />
        {/* Place gardée : le globe ne saute pas quand le message s'efface. */}
        <div className="flex min-h-28 w-full max-w-sm flex-col items-center gap-3 text-center">
          {active.status === "preparing" ? (
            // Pas de paroles ici : elles n'apparaissent que quand elle chante (demande, 2026-11-09).
            <WaitingNote key={active.key} />
          ) : active.status === "error" ? (
            <p role="alert" className="text-sm text-white/80">
              {active.message}
            </p>
          ) : active.status === "ready" ? (
            <p className="text-sm text-white/70">Touche-moi pour m&apos;écouter</p>
          ) : (
            <SungLine lines={active.lines} />
          )}
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        onClick={stopSong}
        aria-label="Arrêter la chanson"
        className="voice-glass grid h-[3.125rem] w-[5.75rem] place-items-center rounded-full transition"
      >
        <IconClose width={20} height={20} />
      </button>
    </div>,
    document.body,
  );
}

/** Part de la chanson laissée à l'intro et à la fin, sans paroles. */
const INTRO = 0.06;
const OUTRO = 0.04;

/**
 * Pendant qu'elle chante : la phrase en cours, et la suivante en pâle, comme un karaoké.
 * Le moment de chaque phrase est estimé au prorata de la durée (la musique ne le donne pas).
 */
function SungLine({ lines }: { lines: string[] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const tick = () => {
      const progress = songProgress();
      if (progress === null || !lines.length) return;
      const share = Math.min(0.999, Math.max(0, (progress - INTRO) / (1 - INTRO - OUTRO)));
      setIndex(Math.floor(share * lines.length));
    };
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [lines]);

  if (!lines.length) return null;
  return (
    <div aria-hidden="true" className="flex flex-col items-center gap-2">
      <p key={index} className="animate-[voice-fade-in_400ms_ease-out] text-lg leading-snug font-medium text-white">
        {lines[index]}
      </p>
      {lines[index + 1] ? <p className="text-sm text-white/45">{lines[index + 1]}</p> : null}
    </div>
  );
}

/** Une chanson met 20 à 40 s à se composer : le message avance pour qu'on ne croie pas que ça bloque. */
const NOTES = [
  "Je compose ta chanson…",
  "J'accorde les instruments…",
  "Je chauffe ma voix…",
  "J'y mets tout mon cœur…",
  "Je suis presque prête…",
  "Encore un petit instant…",
];
const STEP_MS = 6000;

function WaitingNote() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setStep((s) => Math.min(s + 1, NOTES.length - 1)), STEP_MS);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <p key={step} aria-live="polite" className="animate-[voice-fade-in_400ms_ease-out] text-sm text-white/70">
      {NOTES[step]}
    </p>
  );
}

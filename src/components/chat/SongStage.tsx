"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { getServerSong, getSong, stopSong, subscribeSong, toggleSong } from "@/lib/music/song-stage";
import { AwaBlob } from "./AwaBlob";

/**
 * Le grand globe de Tamilya qui chante, en plein écran comme les histoires. Monté une seule fois
 * (layout). Il bouge pendant qu'elle compose, des messages font patienter dessous, puis il gonfle
 * au rythme de la musique. Toucher le globe : pause ; la croix : stop.
 */
export function SongStage() {
  const { active } = useSyncExternalStore(subscribeSong, getSong, getServerSong);
  if (!active || typeof document === "undefined") return null;
  const playing = active.status === "playing";
  const label =
    active.status === "ready" ? "Écouter la chanson" : active.status === "paused" ? "Reprendre la chanson" : playing ? "Mettre la chanson en pause" : "Tamilya compose";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tamilya chante"
      className="voice-overlay fixed inset-0 z-[60] flex flex-col items-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-white"
    >
      <p className="text-sm font-medium tracking-[0.3em] text-white/50 uppercase">Tamilya</p>
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-6">
        <AwaBlob label={label} onActivate={toggleSong} immediate busy={active.status === "preparing"} size="min(60vw, 16rem)" goo={13} />
        {/* Place gardée : le globe ne saute pas quand le message s'efface. */}
        <div className="min-h-6 max-w-xs text-center">
          {active.status === "preparing" ? (
            <WaitingNote key={active.key} />
          ) : active.status === "error" ? (
            <p role="alert" className="text-sm text-white/80">
              {active.message}
            </p>
          ) : active.status === "ready" ? (
            <p className="text-sm text-white/70">Touche-moi pour m&apos;écouter</p>
          ) : null}
        </div>
      </div>
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        onClick={stopSong}
        aria-label="Arrêter la chanson"
        className="grid size-12 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
      >
        <X size={20} aria-hidden="true" />
      </button>
    </div>,
    document.body,
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

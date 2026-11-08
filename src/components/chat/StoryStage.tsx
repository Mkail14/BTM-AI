"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { getServerStories, getStories, stopStory, subscribeStories, toggleStory } from "@/lib/lecture/stage";
import { AwaBlob } from "./AwaBlob";

/**
 * Le grand globe de Tamilya qui raconte une histoire (lecture en 3D), en plein écran comme le vocal.
 * Monté une seule fois pour tout le site (layout) : il ne disparaît pas quand la conversation se
 * redessine. Aucun texte de chargement (demande de l'utilisateur) : le globe bouge pendant qu'elle
 * se prépare, puis gonfle au rythme de ce qu'on entend. Toucher le globe : pause ; la croix : stop.
 */
export function StoryStage() {
  const { active } = useSyncExternalStore(subscribeStories, getStories, getServerStories);
  if (!active || typeof document === "undefined") return null;
  const playing = active.status === "playing";
  const label =
    active.status === "ready" ? "Écouter l'histoire" : active.status === "paused" ? "Reprendre l'histoire" : playing ? "Mettre l'histoire en pause" : "Tamilya se prépare";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tamilya raconte une histoire"
      className="voice-overlay fixed inset-0 z-[60] flex flex-col items-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-white"
    >
      <p className="text-sm font-medium tracking-[0.3em] text-white/50 uppercase">Tamilya</p>
      <div className="flex w-full flex-1 items-center justify-center">
        <AwaBlob label={label} onActivate={toggleStory} immediate busy={!playing && active.status !== "paused"} size="min(60vw, 16rem)" goo={13} />
      </div>
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        onClick={stopStory}
        aria-label="Arrêter l'histoire"
        className="grid size-12 place-items-center rounded-full bg-white/10 transition hover:bg-white/20"
      >
        <X size={20} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}

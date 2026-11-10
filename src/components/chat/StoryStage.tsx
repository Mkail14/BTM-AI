"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { IconClose } from "@/components/ui/icons";
import { getServerStories, getStories, seekStory, stopStory, subscribeStories, toggleStory, type BookTimeline, type StoryView } from "@/lib/lecture/stage";
import { AwaBlob } from "./AwaBlob";
import { useLeavingStage } from "./stage-fade";

/**
 * Le grand globe de Tamilya qui raconte une histoire (lecture en 3D), en plein écran comme le vocal.
 * Monté une seule fois pour tout le site (layout) : il ne disparaît pas quand la conversation se
 * redessine. Le globe bouge pendant qu'elle se prépare, puis gonfle au rythme de ce qu'on entend.
 * Toucher le globe : pause ; la croix : stop. Un livre a sa barre, à faire glisser comme une vidéo.
 */
export function StoryStage() {
  const { active: current } = useSyncExternalStore(subscribeStories, getStories, getServerStories);
  const { shown: active, leaving } = useLeavingStage(current);
  if (!active || typeof document === "undefined") return null;
  const playing = active.status === "playing";
  const label =
    active.status === "ready" ? "Écouter l'histoire" : active.status === "paused" ? "Reprendre l'histoire" : playing ? "Mettre l'histoire en pause" : "Tamilya se prépare";
  const waiting = !active.started && (active.status === "preparing" || playing);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Tamilya raconte une histoire"
      data-leaving={leaving ? "" : undefined}
      className="voice-overlay stage-swap fixed inset-0 z-[60] flex flex-col items-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-white"
    >
      {/* Même fond que le vocal : on passe de l'un à l'autre sans voir de différence. */}
      <span aria-hidden="true" className="voice-aurora" />
      <p className="text-sm font-medium tracking-[0.3em] text-white/50 uppercase">Tamilya</p>
      <div className="flex w-full flex-1 flex-col items-center justify-center gap-6">
        <AwaBlob label={label} onActivate={toggleStory} immediate busy={!playing && active.status !== "paused"} size="min(60vw, 16rem)" goo={13} />
        {/* Place gardée : le globe ne saute pas quand le message s'efface. */}
        <div className="h-6">
          {waiting ? (
            <WaitingNote key={`${active.key}:${active.progress ?? ""}`} kind={active.kind} />
          ) : active.progress ? (
            // Livre : le titre et où on en est, discrets sous le globe.
            <p className="max-w-[80vw] truncate text-center text-sm text-white/60">
              <span className="sr-only">{active.title} : </span>
              {active.progress}
            </p>
          ) : null}
        </div>
      </div>
      {active.timeline ? <BookBar timeline={active.timeline} /> : null}
      <span className="sr-only" aria-live="polite">
        {label}
      </span>
      <button
        type="button"
        onClick={stopStory}
        aria-label="Arrêter l'histoire"
        className="voice-glass grid h-[3.125rem] w-[5.75rem] place-items-center rounded-full transition"
      >
        <IconClose width={20} height={20} />
      </button>
    </div>,
    document.body,
  );
}

/** Après combien de secondes le message change, tant que sa voix ne s'entend pas encore. */
const STEPS = [4000, 10000];

/**
 * L'histoire met quelques secondes à se préparer : sans rien sous le globe, on croirait que ça
 * bloque (demande de l'utilisateur, 2026-11-09). Le message avance, puis s'efface dès sa voix.
 */
function WaitingNote({ kind }: { kind: StoryView["kind"] }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timers = STEPS.map((delay, i) => window.setTimeout(() => setStep(i + 1), delay));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);
  const first = kind === "lecture" ? "Je prépare la lecture…" : "Je suis en train d'imaginer l'histoire…";
  const text = [first, "Je suis presque prête…", "Encore un petit instant…"][step];
  return (
    <p key={text} aria-live="polite" className="animate-[voice-fade-in_400ms_ease-out] text-center text-sm text-white/70">
      {text}
    </p>
  );
}

/** « 50 min », « 2 h 05 » : le temps d'écoute, à la minute près. */
function duration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const rest = minutes % 60;
  return `${Math.floor(minutes / 60)} h${rest ? ` ${String(rest).padStart(2, "0")}` : ""}`;
}

/**
 * La barre du livre (demande de l'utilisateur, 2026-11-10) : où on en est et le temps qui reste,
 * à faire glisser comme celle d'une vidéo. Pendant qu'on la tient, la partie visée s'affiche ; une
 * fois lâchée, la lecture reprend au début de la phrase la plus proche.
 */
function BookBar({ timeline }: { timeline: BookTimeline }) {
  /** base : la position au moment de toucher ; la barre lâchée reste là jusqu'à ce que la lecture y soit. */
  const [drag, setDrag] = useState<{ at: number; base: number; held: boolean } | null>(null);
  const shown = drag && (drag.held || drag.base === timeline.at) ? drag.at : timeline.at;
  const left = (timeline.total - shown) / timeline.rate;
  const part = drag?.held ? timeline.parts.findLast((p) => p.at <= drag.at) : undefined;
  const fill = timeline.total ? (shown / timeline.total) * 100 : 0;
  const elapsed = duration(shown / timeline.rate);
  const remaining = left < 60 ? "Presque fini" : `Il reste ${duration(left)}`;
  const commit = () => {
    if (!drag?.held) return;
    setDrag({ ...drag, held: false });
    seekStory(drag.at);
  };

  return (
    <div className="mb-6 w-full max-w-md">
      <p className="h-5 truncate text-center text-xs text-white/70">{part?.title}</p>
      <input
        type="range"
        min={0}
        max={timeline.total}
        // Les flèches du clavier avancent ou reculent d'environ 30 secondes.
        step={Math.max(1, Math.round(timeline.rate * 30))}
        value={shown}
        onChange={(event) => setDrag({ at: Number(event.target.value), base: drag?.held ? drag.base : timeline.at, held: true })}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
        aria-label="Position dans le livre"
        aria-valuetext={`${elapsed} écoutées, ${remaining.toLowerCase()}`}
        className="book-bar"
        style={{ "--fill": `${fill}%` } as CSSProperties}
      />
      <div className="flex justify-between text-xs text-white/60 tabular-nums">
        <span>{elapsed}</span>
        <span>{remaining}</span>
      </div>
    </div>
  );
}

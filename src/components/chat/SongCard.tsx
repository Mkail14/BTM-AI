"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { parseSongSpec } from "@/lib/music/intent";
import { AwaBlob } from "./AwaBlob";

/**
 * Chanson de Tamilya : les paroles qu'elle vient d'écrire, chantées avec des instruments
 * (Lyria, par /api/music). Le globe de Tamilya chante : il bouge au rythme du son.
 *
 * Elle chante d'elle-même seulement quand la chanson vient d'arriver (le bloc s'écrit sous
 * nos yeux) ; une ancienne conversation rouverte montre un bouton, pour ne pas dépenser une
 * chanson à chaque visite.
 */

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "error"; message: string };

const noop = () => {};
/** Délai sans changement avant de considérer le bloc fini d'écrire. */
const SETTLE_MS = 1_500;

export function SongCard({ spec }: { spec: string }) {
  const parsed = useMemo(() => parseSongSpec(spec), [spec]);
  const [state, setState] = useState<State>({ status: "idle" });
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const globe = useRef<HTMLDivElement>(null);
  const firstSpec = useRef(spec);
  const live = useRef(false);
  const started = useRef(false);

  async function sing() {
    if (!parsed) return;
    started.current = true;
    setState({ status: "loading" });
    try {
      const response = await fetch("/api/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spec }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setState({ status: "error", message: body?.error ?? "Ma voix chantée ne répond pas : réessaie dans un instant." });
        return;
      }
      setState({ status: "ready", url: URL.createObjectURL(await response.blob()) });
    } catch {
      setState({ status: "error", message: "Connexion perdue pendant que je composais : réessaie." });
    }
  }

  // Le bloc grandit pendant que Tamilya écrit : c'est une chanson toute neuve. Une fois
  // les paroles stables, elle chante d'elle-même.
  useEffect(() => {
    if (spec !== firstSpec.current) live.current = true;
    if (!live.current || started.current || !parsed) return;
    const timer = window.setTimeout(() => void sing(), SETTLE_MS);
    return () => window.clearTimeout(timer);
    // sing lit spec et parsed à jour à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, parsed]);

  useEffect(() => () => (state.status === "ready" ? URL.revokeObjectURL(state.url) : undefined), [state]);

  // Le globe suit le son : plus la musique est forte, plus il gonfle.
  useEffect(() => {
    const element = audio.current;
    const box = globe.current;
    if (!playing || !element || !box || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let context: AudioContext | null = null;
    let frame = 0;
    try {
      context = new AudioContext();
      const source = context.createMediaElementSource(element);
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyser.connect(context.destination);
      const data = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / data.length) * 4);
        box.style.transform = `scale(${1 + level * 0.18})`;
        frame = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      // Sans Web Audio, le globe bouge quand même (busy), sans suivre le volume.
    }
    return () => {
      cancelAnimationFrame(frame);
      box.style.transform = "";
      void context?.close();
    };
  }, [playing]);

  if (!parsed) return null;
  const ready = state.status === "ready";

  return (
    <figure className="not-prose my-3 flex flex-col gap-3 rounded-2xl border border-border bg-bg-subtle p-4">
      <div className="flex items-center gap-4">
        <div ref={globe} aria-hidden="true" inert className="grid size-16 shrink-0 place-items-center transition-transform duration-75">
          <AwaBlob label="Tamilya" onActivate={noop} size="3.5rem" goo={4} busy={playing || state.status === "loading"} still={!playing && state.status !== "loading"} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <figcaption className="text-sm font-medium">
            {state.status === "loading" ? "Je compose ta chanson…" : playing ? "Je chante pour toi" : "Ma chanson"}
          </figcaption>
          {ready ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => (playing ? audio.current?.pause() : void audio.current?.play())}
                aria-label={playing ? "Mettre en pause" : "Écouter la chanson"}
                className="btn-rose grid size-11 place-items-center rounded-full"
              >
                {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
              </button>
              <audio
                ref={audio}
                src={state.url}
                autoPlay
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                className="sr-only"
              />
            </div>
          ) : state.status === "idle" ? (
            <button type="button" onClick={() => void sing()} className="btn-rose h-11 self-start rounded-full px-5 text-sm font-medium">
              Écoute-moi chanter
            </button>
          ) : state.status === "loading" ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Composition de la chanson">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            </div>
          ) : null}
          {state.status === "error" ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert" className="text-sm text-fg-muted">
                {state.message}
              </p>
              <button type="button" onClick={() => void sing()} className="zone-appui inline-flex items-center gap-1 text-sm font-medium text-accent">
                <RotateCcw size={14} aria-hidden="true" /> Réessayer
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-fg-muted">Les paroles</summary>
        <p className="mt-2 whitespace-pre-wrap leading-relaxed">{parsed.lyrics}</p>
      </details>
    </figure>
  );
}

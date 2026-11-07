"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Camera, Headphones, Pause, Play, RotateCcw, Square } from "lucide-react";
import type { GeminiVoiceId } from "@/lib/ai/voice/voices";
import { parseReadingBlock } from "@/lib/lecture/intent";
import type { SceneScript } from "@/lib/lecture/script";
import { preloadResonance, ScenePlayer } from "@/lib/lecture/soundscape";
import { AwaBlob } from "./AwaBlob";

/**
 * Lecture en 3D : la personne prend une page de livre en photo (ou a écrit le texte dans la
 * conversation : le serveur le glisse dans le bloc, « texte » puis le texte), Gemini la met en scène
 * (/api/lecture), et Tamilya la lit dans les écouteurs, avec une voix par personnage et des
 * bruits qui tournent autour de la tête (src/lib/lecture/soundscape.ts).
 */

type State =
  | { status: "idle" }
  | { status: "preparing" }
  | { status: "ready"; script: SceneScript }
  | { status: "playing"; script: SceneScript; index: number; paused: boolean }
  | { status: "done"; script: SceneScript }
  | { status: "error"; message: string };

type Voiced = { text: string; voice: GeminiVoiceId | null };

const noop = () => {};
/** Photo envoyée : assez grande pour lire le texte, assez légère pour le débit de Mayotte. */
const MAX_SIDE = 1400;
/** Répliques préparées d'avance pendant que Tamilya lit. */
const AHEAD = 3;

async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
  if (!blob) throw new Error("photo");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Délai sans changement avant de considérer le bloc fini d'écrire. */
const SETTLE_MS = 1_200;

export function ReadingCard({ spec }: { spec: string }) {
  const text = parseReadingBlock(spec);
  // « texte » sans le texte : le serveur va le glisser dans le bloc à la fin de la réponse.
  const waiting = !text && spec.trim() === "texte";
  const [state, setState] = useState<State>({ status: "idle" });
  const firstSpec = useRef(spec);
  const live = useRef(false);
  const started = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const ctx = useRef<AudioContext | null>(null);
  const player = useRef<ScenePlayer | null>(null);
  const voices = useRef(new Map<number, Promise<AudioBuffer | null>>());
  const items = useRef<Voiced[]>([]);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  useEffect(
    () => () => {
      player.current?.stop();
      void wakeLock.current?.release().catch(() => {});
      if (!player.current) void ctx.current?.close().catch(() => {});
    },
    [],
  );

  /** Le son a besoin d'un geste de la personne pour démarrer : on l'ouvre au moment du toucher. */
  function audio(): AudioContext {
    if (!ctx.current || ctx.current.state === "closed") ctx.current = new AudioContext();
    void ctx.current.resume().catch(() => {});
    return ctx.current;
  }

  function voiceOf(index: number): Promise<AudioBuffer | null> {
    const item = items.current[index];
    if (!item) return Promise.resolve(null);
    let pending = voices.current.get(index);
    if (!pending) {
      const load = async () => {
        const response = await fetch("/api/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item.voice ? { text: item.text, voice: item.voice } : { text: item.text }),
          signal: AbortSignal.timeout(45_000),
        });
        if (!response.ok) throw new Error(String(response.status));
        return audio().decodeAudioData(await response.arrayBuffer());
      };
      // Un essai de plus si la connexion a sauté.
      pending = load().catch(() => load().catch(() => null));
      voices.current.set(index, pending);
    }
    return pending;
  }

  async function prepare(source: File | string) {
    started.current = true;
    setState({ status: "preparing" });
    // Le moteur 3D se télécharge pendant que Gemini lit la page.
    void preloadResonance();
    try {
      const payload = typeof source === "string" ? { text: source } : { image: await shrinkPhoto(source), mimeType: "image/jpeg" };
      const response = await fetch("/api/lecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90_000),
      });
      const body = (await response.json().catch(() => null)) as { script?: SceneScript; error?: string } | null;
      if (!response.ok || !body?.script) {
        setState({ status: "error", message: body?.error ?? "Je n'arrive pas à préparer la page : réessaie." });
        return;
      }
      const script = body.script;
      items.current = [...(script.intro ? [{ text: script.intro, voice: null }] : []), ...script.lines.map((l) => ({ text: l.text, voice: l.voice }))];
      voices.current.clear();
      // Les premières voix se préparent pendant que la personne met ses écouteurs.
      for (let i = 0; i <= AHEAD; i++) void voiceOf(i);
      setState({ status: "ready", script });
    } catch {
      setState({ status: "error", message: "Connexion perdue pendant que je préparais la page : réessaie." });
    }
  }

  async function play(script: SceneScript) {
    player.current?.stop();
    const scene = await ScenePlayer.create(audio(), script.place);
    player.current = scene;
    try {
      wakeLock.current = await navigator.wakeLock?.request("screen");
    } catch {
      // L'écran pourra s'éteindre : le son continue en général.
    }
    const offset = script.intro ? 1 : 0;
    setState({ status: "playing", script, index: -1, paused: false });

    if (script.intro) {
      const intro = await voiceOf(0);
      if (intro) await scene.playLine({ voice: null, side: 0, distance: "tout-pres", height: "milieu", from: null }, intro);
      await scene.wait(0.8);
    }
    scene.startAmbiences(script.ambiences);
    await scene.wait(script.ambiences.length ? 2.5 : 0.5);

    let previous: string | null = null;
    for (let i = 0; i < script.lines.length && !scene.isStopped; i++) {
      const line = script.lines[i];
      for (let k = 1; k <= AHEAD; k++) void voiceOf(offset + i + k);
      setState((s) => (s.status === "playing" ? { ...s, index: i } : s));
      // Un silence plus long quand la voix change : on sent qu'un autre parle.
      if (previous !== null && previous !== line.speaker) await scene.wait(0.35);
      const before = line.cues.filter((c) => c.when === "avant");
      if (before.length) await scene.wait(Math.min(1.6, Math.max(...before.map((c) => scene.playCue(c))) * 0.6));
      const voice = await voiceOf(offset + i);
      if (scene.isStopped) break;
      for (const cue of line.cues.filter((c) => c.when === "pendant")) scene.playCue(cue, 0.3);
      if (voice) {
        scene.duck(true);
        await scene.playLine(line, voice);
        scene.duck(false);
      }
      const after = line.cues.filter((c) => c.when === "apres");
      if (after.length) await scene.wait(Math.min(2, Math.max(...after.map((c) => scene.playCue(c))) * 0.7));
      await scene.wait(0.3);
      previous = line.speaker;
    }

    if (!scene.isStopped) {
      scene.fadeOutAmbiences(5);
      await scene.wait(5.2);
      scene.stop();
      setState({ status: "done", script });
    }
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }

  function stop(script: SceneScript) {
    player.current?.stop();
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
    setState({ status: "done", script });
  }

  async function togglePause() {
    if (state.status !== "playing" || !player.current) return;
    if (state.paused) await player.current.resume();
    else await player.current.pause();
    setState({ ...state, paused: !state.paused });
  }

  // Texte tout juste arrivé dans la réponse : la lecture se prépare d'elle-même. Une ancienne
  // conversation rouverte montre un bouton (pour ne pas refaire la mise en scène à chaque visite).
  useEffect(() => {
    if (spec !== firstSpec.current) live.current = true;
    if (!live.current || started.current || !text) return;
    const timer = window.setTimeout(() => void prepare(text), SETTLE_MS);
    return () => window.clearTimeout(timer);
    // prepare lit l'état à jour à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, text]);

  function takePhoto() {
    audio();
    input.current?.click();
  }

  const playing = state.status === "playing" && !state.paused;
  const line = state.status === "playing" && state.index >= 0 ? state.script.lines[state.index] : null;

  return (
    <figure className="not-prose my-3 flex flex-col gap-3 rounded-2xl border border-border bg-bg-subtle p-4">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void prepare(file);
        }}
      />
      <div className="flex items-center gap-4">
        <div aria-hidden="true" inert className="grid size-16 shrink-0 place-items-center">
          <AwaBlob label="Tamilya" onActivate={noop} size="3.5rem" goo={4} busy={playing || state.status === "preparing"} still={!playing && state.status !== "preparing"} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <figcaption className="text-sm font-medium">
            {state.status === "preparing" || waiting
              ? text || waiting
                ? "Je prépare ton histoire…"
                : "Je découvre ta page…"
              : state.status === "ready" || state.status === "playing" || state.status === "done"
                ? state.script.title || "Ta page"
                : "Lecture en 3D"}
          </figcaption>

          {(state.status === "idle" || state.status === "error") && !waiting ? (
            text ? (
              <button type="button" onClick={() => void prepare(text)} className="btn-rose inline-flex h-11 items-center gap-2 self-start rounded-full px-5 text-sm font-medium">
                <BookOpen size={18} aria-hidden="true" /> Préparer la lecture
              </button>
            ) : (
              <button type="button" onClick={takePhoto} className="btn-rose inline-flex h-11 items-center gap-2 self-start rounded-full px-5 text-sm font-medium">
                <Camera size={18} aria-hidden="true" /> Prendre la page en photo
              </button>
            )
          ) : null}

          {state.status === "preparing" || waiting ? (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Préparation de la page">
              <div className="h-full w-1/3 animate-pulse rounded-full bg-accent" />
            </div>
          ) : null}

          {state.status === "ready" ? (
            <button type="button" onClick={() => void play(state.script)} className="btn-rose inline-flex h-11 items-center gap-2 self-start rounded-full px-5 text-sm font-medium">
              <Play size={18} aria-hidden="true" /> Je ferme les yeux
            </button>
          ) : null}

          {state.status === "playing" ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void togglePause()}
                aria-label={state.paused ? "Reprendre la lecture" : "Mettre en pause"}
                className="btn-rose grid size-11 place-items-center rounded-full"
              >
                {state.paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => stop(state.script)}
                aria-label="Arrêter la lecture"
                className="zone-appui grid size-11 place-items-center rounded-full border border-border"
              >
                <Square size={16} aria-hidden="true" />
              </button>
              <span className="text-xs text-fg-muted">
                {state.index >= 0 ? `${state.index + 1} / ${state.script.lines.length}` : ""}
              </span>
            </div>
          ) : null}

          {state.status === "done" ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void play(state.script)} className="zone-appui inline-flex items-center gap-1 text-sm font-medium text-accent">
                <RotateCcw size={14} aria-hidden="true" /> Réécouter
              </button>
              {text ? null : (
                <button type="button" onClick={takePhoto} className="zone-appui inline-flex items-center gap-1 text-sm font-medium text-accent">
                  <Camera size={14} aria-hidden="true" /> Une autre page
                </button>
              )}
            </div>
          ) : null}

          {state.status === "error" ? (
            <p role="alert" className="text-sm text-fg-muted">
              {state.message}
            </p>
          ) : null}
        </div>
      </div>

      {state.status === "preparing" || state.status === "ready" || waiting ? (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          <Headphones size={16} aria-hidden="true" className="shrink-0" /> Mets tes écouteurs : les voix et les bruits viennent de tous les côtés.
        </p>
      ) : null}

      {line ? (
        <p className="text-sm leading-relaxed" aria-live="polite">
          <span className="font-medium">{line.speaker} : </span>
          {line.text}
        </p>
      ) : null}
    </figure>
  );
}

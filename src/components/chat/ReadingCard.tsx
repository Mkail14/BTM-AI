"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Camera, Headphones, Pause, Play, RotateCcw, Square } from "lucide-react";
import type { GeminiVoiceId } from "@/lib/ai/voice/voices";
import { parseReadingBlock } from "@/lib/lecture/intent";
import { announceReadingDone, takeReadingAutoStart } from "@/lib/lecture/auto";
import type { SceneLine, SceneMeta, SceneScript } from "@/lib/lecture/script";
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
/** Page qui arrive au fil de l'eau : les répliques s'ajoutent, la lecture les attend si besoin. */
type Feed = { script: SceneScript; done: boolean; waiters: (() => void)[] };

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

export function ReadingCard({ spec }: { spec: string }) {
  const text = parseReadingBlock(spec);
  // « texte » sans le texte : le serveur va le glisser dans le bloc à la fin de la réponse.
  const waiting = !text && spec.trim() === "texte";
  const [state, setState] = useState<State>({ status: "idle" });
  const firstSpec = useRef(spec);
  // Lancée depuis le vocal en direct (auto.ts) : elle démarre seule dès son ouverture.
  const live = useRef(false);
  const autoChecked = useRef(false);
  if (!autoChecked.current) {
    autoChecked.current = true;
    if (takeReadingAutoStart(spec)) live.current = true;
  }
  const feed = useRef<Feed | null>(null);
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

  /** La réplique i dès qu'elle est arrivée ; null quand la page est finie. */
  function lineAt(i: number): Promise<SceneLine | null> {
    const current = feed.current;
    if (!current) return Promise.resolve(null);
    return new Promise((resolve) => {
      const check = () => {
        if (current.script.lines[i]) resolve(current.script.lines[i]);
        else if (current.done) resolve(null);
        else current.waiters.push(check);
      };
      check();
    });
  }

  function wake(current: Feed) {
    const waiters = current.waiters.splice(0);
    for (const waiter of waiters) waiter();
  }

  function finish(current: Feed | null) {
    if (!current || current.done) return;
    current.done = true;
    wake(current);
  }

  /**
   * La page arrive au fil de l'eau (/api/lecture) : le décor et l'intro dès le début du script,
   * puis chaque réplique. La lecture démarre tout de suite, sans attendre la page entière.
   */
  async function prepare(source: File | string) {
    started.current = true;
    setState({ status: "preparing" });
    // Le son s'ouvre maintenant (geste ou app Android) ; le moteur 3D se télécharge pendant que Gemini lit.
    audio();
    void preloadResonance();
    let current: Feed | null = null;
    const fail = (message: string) => {
      finish(current);
      if (!current || !current.script.lines.length) {
        player.current?.stop();
        setState({ status: "error", message });
      }
    };
    try {
      const payload = typeof source === "string" ? { text: source } : { image: await shrinkPhoto(source), mimeType: "image/jpeg" };
      const response = await fetch("/api/lecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setState({ status: "error", message: body?.error ?? "Je n'arrive pas à préparer la page : réessaie." });
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handle = (event: { type?: string; meta?: SceneMeta; line?: SceneLine; message?: string }) => {
        if (event.type === "meta" && event.meta && !current) {
          current = { script: { ...event.meta, lines: [] }, done: false, waiters: [] };
          feed.current = current;
          items.current = event.meta.intro ? [{ text: event.meta.intro, voice: null }] : [];
          voices.current.clear();
          void voiceOf(0);
          void startPlaying(current.script);
        } else if (event.type === "line" && event.line && current) {
          current.script.lines.push(event.line);
          items.current.push({ text: event.line.text, voice: event.line.voice });
          // Les toutes premières voix se préparent dès qu'elles arrivent.
          if (items.current.length <= AHEAD + 1) void voiceOf(items.current.length - 1);
          wake(current);
        } else if (event.type === "end") {
          finish(current);
        } else if (event.type === "error") {
          fail(event.message ?? "Je n'arrive pas à préparer la page : réessaie.");
        }
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = done ? "" : (lines.pop() ?? "");
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            handle(JSON.parse(line));
          } catch {
            // Ligne coupée : ignorée.
          }
        }
        if (done) break;
      }
      if (!current) fail("Je n'arrive pas à préparer la page : réessaie.");
      else finish(current);
    } catch {
      fail("Connexion perdue pendant que je préparais la page : réessaie.");
    }
  }

  /**
   * La lecture démarre d'elle-même dès le début du script (demande de l'utilisateur : pas de bouton
   * à toucher). L'app Android permet le son sans geste ; si un navigateur le bloque, le bouton
   * « Je ferme les yeux » reste là.
   */
  async function startPlaying(script: SceneScript) {
    setState({ status: "ready", script });
    const context = audio();
    await Promise.race([context.resume().catch(() => {}), new Promise((resolve) => window.setTimeout(resolve, 800))]);
    if (context.state === "running") void play(script);
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

    // Le décor monte tout de suite, pendant que la voix de Tamilya arrive.
    scene.startAmbiences(script.ambiences, 3);
    if (script.intro) {
      const intro = await voiceOf(0);
      if (intro && !scene.isStopped) await scene.playLine({ voice: null, side: 0, distance: "tout-pres", height: "milieu", from: null }, intro);
      await scene.wait(0.6);
    } else {
      await scene.wait(script.ambiences.length ? 2 : 0.3);
    }

    let previous: string | null = null;
    for (let i = 0; !scene.isStopped; i++) {
      const line = await lineAt(i);
      if (!line || scene.isStopped) break;
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
      announceReadingDone();
    }
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
  }

  function stop(script: SceneScript) {
    player.current?.stop();
    void wakeLock.current?.release().catch(() => {});
    wakeLock.current = null;
    setState({ status: "done", script });
    announceReadingDone();
  }

  async function togglePause() {
    if (state.status !== "playing" || !player.current) return;
    if (state.paused) await player.current.resume();
    else await player.current.pause();
    setState({ ...state, paused: !state.paused });
  }

  // Texte tout juste arrivé dans la réponse (ou lecture lancée depuis le vocal) : elle se prépare
  // et démarre d'elle-même, tout de suite. Une ancienne conversation rouverte montre un bouton
  // (pour ne pas refaire la mise en scène à chaque visite).
  useEffect(() => {
    if (spec !== firstSpec.current) live.current = true;
    if (!live.current || started.current || !text) return;
    void prepare(text);
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

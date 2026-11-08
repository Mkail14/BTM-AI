import { setVoiceLevelSource } from "@/lib/chat/voice-level";
import type { GeminiVoiceId } from "@/lib/ai/voice/voices";
import { announceReadingDone } from "./auto";
import type { SceneLine, SceneMeta, SceneScript } from "./script";
import { preloadResonance, ScenePlayer } from "./soundscape";
import { preloadSounds } from "./sounds";
import { patchStory, unlockAudio, type StorySource } from "./stage";

/**
 * Moteur de la lecture en 3D : la page (photo ou texte) ou l'histoire demandée part à Gemini
 * (/api/lecture), qui la met en scène au fil de l'eau ; Tamilya la raconte dans les écouteurs,
 * une voix par personnage, les bruits autour de la tête (soundscape.ts). Le grand globe
 * (StoryStage) montre où on en est. Une seule histoire à la fois.
 */

type Voiced = { text: string; voice: GeminiVoiceId | null };
/** Page qui arrive au fil de l'eau : les répliques s'ajoutent, la lecture les attend si besoin. */
type Feed = { script: SceneScript; done: boolean; waiters: (() => void)[] };
type Story = {
  key: string;
  feed: Feed | null;
  items: Voiced[];
  voices: Map<number, Promise<AudioBuffer | null>>;
  outro: Promise<AudioBuffer | null> | null;
  /** Fermée par la personne pendant la préparation : elle ne démarre pas toute seule derrière. */
  cancelled: boolean;
};

/** Photo envoyée : assez grande pour lire le texte, assez légère pour le débit de Mayotte. */
const MAX_SIDE = 1400;
/** Répliques préparées d'avance pendant que Tamilya lit. */
const AHEAD = 3;
const FAILED = "Je n'arrive pas à préparer la page : réessaie.";

const stories = new Map<string, Story>();
let current: Story | null = null;
let player: ScenePlayer | null = null;
let paused = false;
let wakeLock: WakeLockSentinel | null = null;

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

function speak(item: Voiced): Promise<AudioBuffer | null> {
  const load = async () => {
    const response = await fetch("/api/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(item.voice ? { text: item.text, voice: item.voice } : { text: item.text }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(String(response.status));
    return unlockAudio().decodeAudioData(await response.arrayBuffer());
  };
  // Un essai de plus si la connexion a sauté.
  return load().catch(() => load().catch(() => null));
}

function voiceOf(story: Story, index: number): Promise<AudioBuffer | null> {
  const item = story.items[index];
  if (!item) return Promise.resolve(null);
  let pending = story.voices.get(index);
  if (!pending) story.voices.set(index, (pending = speak(item)));
  return pending;
}

/** La réplique i dès qu'elle est arrivée ; null quand la page est finie. */
function lineAt(story: Story, i: number): Promise<SceneLine | null> {
  const feed = story.feed;
  if (!feed) return Promise.resolve(null);
  return new Promise((resolve) => {
    const check = () => {
      if (feed.script.lines[i]) resolve(feed.script.lines[i]);
      else if (feed.done) resolve(null);
      else feed.waiters.push(check);
    };
    check();
  });
}

function wake(feed: Feed) {
  for (const waiter of feed.waiters.splice(0)) waiter();
}

function finish(feed: Feed | null) {
  if (!feed || feed.done) return;
  feed.done = true;
  wake(feed);
}

function stopPlayer() {
  setVoiceLevelSource(null);
  player?.stop();
  player = null;
  paused = false;
  void wakeLock?.release().catch(() => {});
  wakeLock = null;
}

/** Raconte l'histoire de cette clé : rejouée si elle est déjà prête, sinon préparée. */
export async function runStory(key: string, source: StorySource) {
  if (current && current.key !== key) current.cancelled = true;
  stopPlayer();
  const known = stories.get(key);
  if (known?.feed?.done && known.feed.script.lines.length) {
    known.cancelled = false;
    current = known;
    return startPlaying(known, known.feed.script);
  }
  const story: Story = { key, feed: null, items: [], voices: new Map(), outro: null, cancelled: false };
  stories.set(key, story);
  current = story;
  await prepare(story, source);
}

/**
 * La page arrive au fil de l'eau (/api/lecture) : le décor et l'intro dès le début du script,
 * puis chaque réplique. La lecture démarre tout de suite, sans attendre la page entière.
 */
async function prepare(story: Story, source: StorySource) {
  // Le moteur 3D se télécharge pendant que Gemini écrit.
  void preloadResonance();
  const fail = (message: string) => {
    finish(story.feed);
    if (!story.feed || !story.feed.script.lines.length) {
      stopPlayer();
      patchStory(story.key, { status: "error", message }, false);
      announceReadingDone();
    }
  };
  try {
    const payload = "photo" in source ? { image: await shrinkPhoto(source.photo), mimeType: "image/jpeg" } : source;
    const response = await fetch("/api/lecture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return fail(body?.error ?? FAILED);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const handle = (event: { type?: string; meta?: SceneMeta; line?: SceneLine; message?: string }) => {
      if (event.type === "meta" && event.meta && !story.feed) {
        story.feed = { script: { ...event.meta, lines: [] }, done: false, waiters: [] };
        // Les vrais sons du décor partent tout de suite sur le réseau.
        preloadSounds(event.meta.ambiences.map((a) => a.sound));
        story.items = event.meta.intro ? [{ text: event.meta.intro, voice: null }] : [];
        patchStory(story.key, { title: event.meta.title });
        void voiceOf(story, 0);
        void startPlaying(story, story.feed.script);
      } else if (event.type === "line" && event.line && story.feed) {
        story.feed.script.lines.push(event.line);
        preloadSounds(event.line.cues.map((c) => c.sound));
        story.items.push({ text: event.line.text, voice: event.line.voice });
        // Les toutes premières voix se préparent dès qu'elles arrivent.
        if (story.items.length <= AHEAD + 1) void voiceOf(story, story.items.length - 1);
        wake(story.feed);
      } else if (event.type === "end") {
        finish(story.feed);
        const outro = story.feed?.script.outro;
        if (outro && !story.outro) story.outro = speak({ text: outro, voice: null });
      } else if (event.type === "error") {
        fail(event.message ?? FAILED);
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
    if (!story.feed) fail(FAILED);
    else finish(story.feed);
  } catch {
    fail("Connexion perdue pendant que je préparais la page : réessaie.");
  }
}

/**
 * La lecture démarre d'elle-même (pas de bouton à toucher : demande de l'utilisateur). L'app
 * Android permet le son sans geste ; si un navigateur le bloque, toucher le globe la lance.
 */
async function startPlaying(story: Story, script: SceneScript) {
  if (story.cancelled || current !== story) return;
  const context = unlockAudio();
  await Promise.race([context.resume().catch(() => {}), new Promise((resolve) => window.setTimeout(resolve, 800))]);
  if (story.cancelled || current !== story) return;
  if (context.state === "running") void play(story, script);
  else patchStory(story.key, { status: "ready" });
}

async function play(story: Story, script: SceneScript) {
  stopPlayer();
  const scene = await ScenePlayer.create(unlockAudio(), script.place);
  if (story.cancelled || current !== story) return scene.stop();
  player = scene;
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch {
    // L'écran pourra s'éteindre : le son continue en général.
  }
  const offset = script.intro ? 1 : 0;
  patchStory(story.key, { status: "playing", title: script.title }, true);
  setVoiceLevelSource(() => scene.level());

  // Le décor monte tout de suite (après au plus 4 s d'attente des vrais sons ; sinon, la version fabriquée).
  await scene.prepare(script.ambiences.map((a) => a.sound), 4000);
  scene.startAmbiences(script.ambiences, 3);
  if (script.intro) {
    const intro = await voiceOf(story, 0);
    if (intro && !scene.isStopped) await scene.playLine({ voice: null, side: 0, distance: "tout-pres", height: "milieu", from: null }, intro);
    await scene.wait(0.6);
  } else {
    await scene.wait(script.ambiences.length ? 2 : 0.3);
  }

  let previous: string | null = null;
  for (let i = 0; !scene.isStopped; i++) {
    const line = await lineAt(story, i);
    if (!line || scene.isStopped) break;
    for (let k = 1; k <= AHEAD; k++) void voiceOf(story, offset + i + k);
    // Un silence plus long quand la voix change : on sent qu'un autre parle.
    if (previous !== null && previous !== line.speaker) await scene.wait(0.35);
    if (line.cues.length) await scene.prepare(line.cues.map((c) => c.sound), 1500);
    const before = line.cues.filter((c) => c.when === "avant");
    if (before.length) await scene.wait(Math.min(1.6, Math.max(...before.map((c) => scene.playCue(c))) * 0.6));
    const voice = await voiceOf(story, offset + i);
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

  if (scene.isStopped) return;
  scene.fadeOutAmbiences(5);
  await scene.wait(1.6);
  // Elle prend des nouvelles, à sa façon (phrase écrite par Gemini avec l'histoire).
  const outro = script.outro ? await (story.outro ??= speak({ text: script.outro, voice: null })) : null;
  if (outro && !scene.isStopped) await scene.playLine({ voice: null, side: 0, distance: "tout-pres", height: "milieu", from: null }, outro);
  await scene.wait(outro ? 0.4 : 3.6);
  const completed = !scene.isStopped;
  if (player === scene) stopPlayer();
  else scene.stop();
  patchStory(story.key, { status: "done" }, false);
  announceReadingDone({ converse: completed && Boolean(outro) });
}

/** Toucher le globe : lance l'histoire si le navigateur attendait un geste, sinon pause / reprise. */
export async function toggleStory() {
  const story = current;
  if (!story) return;
  if (!player) {
    if (story.feed) void play(story, story.feed.script);
    return;
  }
  if (paused) await player.resume();
  else await player.pause();
  paused = !paused;
  patchStory(story.key, { status: paused ? "paused" : "playing" });
}

/** La croix : arrête l'histoire (ou l'empêche de démarrer si elle se prépare encore). */
export function stopStory() {
  const story = current;
  if (!story) return;
  story.cancelled = true;
  stopPlayer();
  patchStory(story.key, { status: story.feed?.script.lines.length ? "done" : "error", message: story.feed ? undefined : "Histoire arrêtée." }, false);
  // Le vocal en direct attendait la fin de l'histoire : il peut reprendre.
  announceReadingDone();
}

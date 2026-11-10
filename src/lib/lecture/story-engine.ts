import { setVoiceLevelSource } from "@/lib/chat/voice-level";
import type { GeminiVoiceId } from "@/lib/ai/voice/voices";
import { announceReadingDone } from "./auto";
import type { SceneLine, SceneMeta, SceneScript } from "./script";
import { preloadResonance, ScenePlayer } from "./soundscape";
import { LIGHT_MOODS, SCARY_SOUNDS, type Mood } from "./bank";
import { preloadMusic, preloadSounds, setSoundCatalog, soundInfo } from "./sounds";

/** Réglages de /admin/sons d'abord (reçus avec l'histoire), sinon les sons d'origine. */
const isLight = (mood: Mood | null) => mood !== null && (soundInfo(mood) ? soundInfo(mood)?.light === true : LIGHT_MOODS.has(mood));
const isScary = (sound: string) => (soundInfo(sound) ? soundInfo(sound)?.scary === true : SCARY_SOUNDS.has(sound));
import { patchStory, unlockAudio, type BookStart, type StorySource } from "./stage";
import { bookShare, EMPTY_MEMORY, nextChunk, nextMemory, type BookContext, type BookMemory, type StoredBook } from "./book";

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
  /** L'histoire que montre le globe (stage.ts) : un livre garde la même d'un morceau à l'autre. */
  view: string;
  feed: Feed | null;
  items: Voiced[];
  voices: Map<number, Promise<AudioBuffer | null>>;
  outro: Promise<AudioBuffer | null> | null;
  /** Fermée par la personne pendant la préparation : elle ne démarre pas toute seule derrière. */
  cancelled: boolean;
  /** Morceau d'un livre : sa place, la mémoire reçue, et ce qu'il laisse au suivant. */
  book: BookPiece | null;
  /** Le début du script est arrivé (ou la préparation a échoué pour de bon). */
  ready: Promise<void>;
  markReady: () => void;
};

/**
 * Un livre lu d'un bout à l'autre : chaque morceau est une histoire préparée par Gemini, la
 * suivante pendant que la précédente se lit. La scène 3D reste ouverte entre les deux : décor,
 * lieu et musique changent en fondu, sans coupure.
 */
type BookRun = { book: StoredBook; view: string; cancelled: boolean };
type BookPiece = {
  run: BookRun;
  chapter: number;
  chunk: number;
  /** Mémoire reçue (gardée avec le marque-page : reprendre ici redonne les mêmes voix). */
  memory: BookMemory;
  /** Mémoire laissée au morceau suivant, une fois le début du script arrivé. */
  after: BookMemory | null;
  /** Mise en scène impossible : la narratrice lit le texte simplement, sans toucher au décor. */
  plain: boolean;
  next: Story | null;
};

/**
 * Photo envoyée : assez grande pour lire le texte, assez légère pour le débit de Mayotte. Comptée
 * en pixels (une photo 4:3 reste à 1400 × 1050) : une capture d'écran de téléphone, haute et
 * étroite, garde ainsi des lettres lisibles au lieu de tomber à 630 px de large.
 */
const MAX_PIXELS = 1400 * 1050;
const MAX_SIDE = 2400;
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
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height), Math.sqrt(MAX_PIXELS / (bitmap.width * bitmap.height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d")!;
  // Fond blanc : une image PNG transparente deviendrait noire en JPEG, texte noir compris.
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
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
function newStory(key: string, view: string, book: BookPiece | null = null): Story {
  let markReady = () => {};
  const ready = new Promise<void>((resolve) => (markReady = resolve));
  return { key, view, feed: null, items: [], voices: new Map(), outro: null, cancelled: false, book, ready, markReady };
}

function cancel(story: Story | null) {
  if (!story) return;
  story.cancelled = true;
  if (story.book) story.book.run.cancelled = true;
}

export async function runStory(key: string, source: StorySource) {
  if (current && current.key !== key) cancel(current);
  stopPlayer();
  if ("book" in source) return runBook(key, source.book);
  const known = stories.get(key);
  if (known?.feed?.done && known.feed.script.lines.length) {
    known.cancelled = false;
    current = known;
    return startPlaying(known, known.feed.script);
  }
  const story = newStory(key, key);
  stories.set(key, story);
  current = story;
  await prepare(story, "photo" in source ? shrinkPhoto(source.photo).then((image) => ({ image, mimeType: "image/jpeg" })) : Promise.resolve(source));
}

/** Ouvre le livre au morceau demandé ; la mémoire du marque-page revient s'il reprend au même endroit. */
async function runBook(view: string, start: BookStart) {
  const { loadBook, loadProgress } = await import("./book-store");
  const [book, saved] = await Promise.all([loadBook(start.id).catch(() => null), loadProgress(start.id).catch(() => null)]);
  if (!book || !book.chapters[start.chapter]?.chunks[start.chunk]) {
    patchStory(view, { status: "error", message: "Je ne retrouve pas ce livre sur ce téléphone." }, false);
    return announceReadingDone();
  }
  const run: BookRun = { book, view, cancelled: false };
  const kept = saved && saved.chapter === start.chapter && saved.chunk === start.chunk ? saved.memory : null;
  // Ailleurs dans le livre : les voix des personnages restent, le résumé ne va plus.
  const memory = kept ?? { ...EMPTY_MEMORY, personnages: saved?.memory?.personnages ?? [] };
  const story = bookStory(run, start.chapter, start.chunk, memory, start.chunk > 0, true);
  current = story;
}

/** Prépare un morceau du livre (et le lance si c'est le premier). */
function bookStory(run: BookRun, chapter: number, chunk: number, memory: BookMemory, reprise: boolean, autostart: boolean): Story {
  const story = newStory(`${run.view}#${chapter}.${chunk}`, run.view, { run, chapter, chunk, memory, after: null, plain: false, next: null });
  const part = run.book.chapters[chapter];
  const livre: BookContext = {
    livre: run.book.title,
    chapitre: part.title,
    nouveauChapitre: chunk === 0,
    reprise,
    fin: nextChunk(run.book, chapter, chunk) === null,
    ...memory,
  };
  void prepare(story, Promise.resolve({ text: part.chunks[chunk], livre }), autostart);
  return story;
}

/** Le morceau suivant, préparé pendant que celui-ci se lit (un seul d'avance). */
function prepareNext(story: Story) {
  const piece = story.book;
  if (!piece || piece.next || piece.run.cancelled) return;
  const at = nextChunk(piece.run.book, piece.chapter, piece.chunk);
  if (!at) return;
  piece.next = bookStory(piece.run, at.chapter, at.chunk, piece.after ?? piece.memory, false, false);
}

/** Texte d'un morceau découpé en répliques de la narratrice (mise en scène impossible, ou fin oubliée par Gemini). */
function plainLines(text: string): SceneLine[] {
  const lines: SceneLine[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) lines.push({ voice: null, speaker: "Tamilya", text: current.trim(), side: 0, distance: "tout-pres", height: "milieu", from: null, path: [], placed: false, cues: [], music: null });
    current = "";
  };
  for (const paragraph of text.split(/\n{2,}/)) {
    for (const sentence of paragraph.split(/(?<=[.!?…»])\s+/)) {
      if (current && current.length + sentence.length > 450) push();
      current = current ? `${current} ${sentence}` : sentence;
    }
    push();
  }
  return lines;
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Ce que Gemini n'a pas recopié à la fin du morceau (coupé, ou flux interrompu) : la narratrice
 * le lit simplement, pour ne jamais sauter de texte. Vide si tout y est ou si on ne s'y retrouve pas.
 */
function leftover(text: string, lines: SceneLine[]): string {
  const last = lines.at(-1);
  if (!last) return text;
  const whole = squash(text);
  const tail = squash(last.text).slice(-40);
  const at = tail.length >= 12 ? whole.lastIndexOf(tail) : -1;
  if (at < 0) return "";
  const rest = whole.slice(at + tail.length).trim();
  return rest.length > 80 ? rest : "";
}

/**
 * La page arrive au fil de l'eau (/api/lecture) : le décor et l'intro dès le début du script,
 * puis chaque réplique. La lecture démarre tout de suite, sans attendre la page entière.
 */
async function prepare(story: Story, request: Promise<object>, autostart = true) {
  // Le moteur 3D se télécharge pendant que Gemini écrit.
  void preloadResonance();
  const piece = story.book;
  const chunkText = piece ? piece.run.book.chapters[piece.chapter].chunks[piece.chunk] : "";
  /** Livre : le texte manquant est lu simplement, et le morceau suivant se prépare. */
  const complete = () => {
    if (!piece || !story.feed) return;
    const rest = story.feed.done ? "" : leftover(chunkText, story.feed.script.lines);
    for (const line of plainLines(rest)) {
      story.feed.script.lines.push(line);
      story.items.push({ text: line.text, voice: null });
    }
    finish(story.feed);
    prepareNext(story);
  };
  const fail = (message: string) => {
    if (piece && !piece.run.cancelled) {
      // Un livre ne s'arrête pas pour un morceau raté : la narratrice le lit sans mise en scène.
      if (!story.feed) {
        piece.plain = true;
        const lines = plainLines(chunkText);
        story.feed = { script: { title: piece.run.book.chapters[piece.chapter].title, place: "maison", intro: "", outro: "", music: null, ambiences: [], lines }, done: false, waiters: [] };
        story.items = lines.map((line) => ({ text: line.text, voice: null }));
        piece.after = piece.memory;
        story.markReady();
        if (autostart) void startPlaying(story, story.feed.script);
      }
      return complete();
    }
    finish(story.feed);
    story.markReady();
    if (!story.feed || !story.feed.script.lines.length) {
      stopPlayer();
      patchStory(story.view, { status: "error", message }, false);
      announceReadingDone();
    }
  };
  try {
    const payload = await request;
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
        // Les sons du moment (/admin/sons) : adresses, décors, sons qui font peur.
        setSoundCatalog(event.meta.sons);
        story.feed = { script: { ...event.meta, lines: [] }, done: false, waiters: [] };
        // Les vrais sons du décor partent tout de suite sur le réseau.
        preloadSounds(event.meta.ambiences.map((a) => a.sound));
        if (event.meta.music) void preloadMusic(event.meta.music);
        story.items = event.meta.intro ? [{ text: event.meta.intro, voice: null }] : [];
        if (piece) piece.after = nextMemory(piece.memory, event.meta);
        else patchStory(story.view, { title: event.meta.title });
        void voiceOf(story, 0);
        story.markReady();
        if (autostart) void startPlaying(story, story.feed.script);
      } else if (event.type === "line" && event.line && story.feed) {
        story.feed.script.lines.push(event.line);
        preloadSounds(event.line.cues.map((c) => c.sound));
        if (event.line.music && event.line.music !== "silence") void preloadMusic(event.line.music);
        story.items.push({ text: event.line.text, voice: event.line.voice });
        // Les toutes premières voix se préparent dès qu'elles arrivent.
        if (story.items.length <= AHEAD + 1) void voiceOf(story, story.items.length - 1);
        wake(story.feed);
      } else if (event.type === "end") {
        if (piece) complete();
        else finish(story.feed);
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
    else if (piece) complete();
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
  else patchStory(story.view, { status: "ready" });
}

/** Où on en est dans le livre, sous le globe. */
function bookProgress(piece: BookPiece) {
  const title = piece.run.book.chapters[piece.chapter].title;
  return `${title.length > 48 ? `${title.slice(0, 47)}…` : title} · ${Math.round(bookShare(piece.run.book, piece.chapter, piece.chunk) * 100)} %`;
}

/** Marque-page : ce morceau, avec la mémoire qui permet de le préparer pareil (mêmes voix, même résumé). */
function saveBookmark(piece: BookPiece, done = false) {
  void import("./book-store").then(({ saveProgress }) =>
    saveProgress(piece.run.book.id, { chapter: piece.chapter, chunk: piece.chunk, memory: piece.memory, updatedAt: Date.now(), ...(done && { done }) }),
  ).catch(() => {});
}

/**
 * carried : la scène du morceau d'avant (livre), gardée ouverte ; le décor, le lieu et la musique
 * passent en fondu à ceux de ce morceau.
 */
async function play(story: Story, script: SceneScript, carried: ScenePlayer | null = null) {
  let scene: ScenePlayer;
  if (carried) {
    scene = carried;
  } else {
    stopPlayer();
    scene = await ScenePlayer.create(unlockAudio(), script.place);
    if (story.cancelled || current !== story) return scene.stop();
    player = scene;
    try {
      wakeLock = await navigator.wakeLock?.request("screen");
    } catch {
      // L'écran pourra s'éteindre : le son continue en général.
    }
  }
  const piece = story.book;
  if (piece) saveBookmark(piece);
  const offset = script.intro ? 1 : 0;
  patchStory(story.view, { status: "playing", title: piece ? piece.run.book.title : script.title, ...(piece && { progress: bookProgress(piece) }) }, true);
  setVoiceLevelSource(() => scene.level());
  // Sa voix se fait entendre : le message d'attente sous le globe s'efface.
  let heard = false;
  const hear = () => {
    if (heard) return;
    heard = true;
    patchStory(story.view, { started: true });
  };

  // Le décor monte tout de suite (après au plus 4 s d'attente des vrais sons ; sinon, la version fabriquée).
  // La musique monte dès qu'elle est arrivée, sans retenir l'histoire.
  // Morceau lu sans mise en scène : la scène du morceau d'avant continue telle quelle.
  let mood: Mood | null = piece?.plain ? null : script.music;
  if (!piece?.plain) {
    void scene.setMusic(mood);
    if (carried) scene.setPlace(script.place);
    await scene.prepare(script.ambiences.map((a) => a.sound), 4000);
    // Sous une musique légère, le décor reste un peu plus discret.
    const ambiences = isLight(mood) ? script.ambiences.map((a) => ({ ...a, volume: a.volume * 0.75 })) : script.ambiences;
    if (carried) scene.changeAmbiences(ambiences, 4);
    else scene.startAmbiences(ambiences, 3);
  }
  if (script.intro) {
    const intro = await voiceOf(story, 0);
    if (intro && !scene.isStopped) {
      // La musique et le décor restent sous sa voix dès l'intro.
      scene.duck(true);
      hear();
      await scene.playLine({ voice: null, side: 0, distance: "tout-pres", height: "milieu", from: null }, intro);
      scene.duck(false);
    }
    await scene.wait(0.6);
  } else if (!carried) {
    await scene.wait(script.ambiences.length ? 2 : 0.3);
  }

  let previous: string | null = null;
  for (let i = 0; !scene.isStopped; i++) {
    const line = await lineAt(story, i);
    if (!line || scene.isStopped) break;
    if (line.music) {
      mood = line.music === "silence" ? null : line.music;
      void scene.setMusic(mood, line.music === "silence" ? 1.2 : 3);
    }
    // Une histoire légère ne fait pas peur : cœur, porte qui grince et tonnerre sont écartés.
    const cues = isLight(mood) ? line.cues.filter((c) => !isScary(c.sound)) : line.cues;
    for (let k = 1; k <= AHEAD; k++) void voiceOf(story, offset + i + k);
    // Un silence plus long quand la voix change : on sent qu'un autre parle.
    if (previous !== null && previous !== line.speaker) await scene.wait(0.35);
    if (cues.length) await scene.prepare(cues.map((c) => c.sound), 1500);
    const before = cues.filter((c) => c.when === "avant");
    if (before.length) await scene.wait(Math.min(1.6, Math.max(...before.map((c) => scene.playCue(c))) * 0.6));
    const voice = await voiceOf(story, offset + i);
    if (scene.isStopped) break;
    for (const cue of cues.filter((c) => c.when === "pendant")) scene.playCue(cue, 0.3);
    if (voice) {
      scene.duck(true);
      hear();
      await scene.playLine(line, voice);
      scene.duck(false);
    }
    // Un livre fait des heures de voix : chaque réplique lue libère sa mémoire.
    if (piece) story.voices.delete(offset + i);
    const after = cues.filter((c) => c.when === "apres");
    if (after.length) await scene.wait(Math.min(2, Math.max(...after.map((c) => scene.playCue(c))) * 0.7));
    await scene.wait(0.3);
    previous = line.speaker;
  }

  if (scene.isStopped) return;
  // Livre : le morceau suivant prend la suite dans la même scène.
  if (piece && !piece.run.cancelled) {
    prepareNext(story);
    const next = piece.next;
    if (next) {
      current = next;
      if (!next.feed) patchStory(story.view, { started: false });
      await next.ready;
      if (scene.isStopped || next.cancelled || current !== next) return;
      if (next.feed?.script.lines.length) return play(next, next.feed.script, scene);
    } else {
      saveBookmark(piece, true);
    }
  }
  scene.fadeOutAmbiences(5);
  await scene.wait(1.6);
  // Elle prend des nouvelles, à sa façon (phrase écrite par Gemini avec l'histoire).
  const outro = script.outro ? await (story.outro ??= speak({ text: script.outro, voice: null })) : null;
  if (outro && !scene.isStopped) await scene.playLine({ voice: null, side: 0, distance: "tout-pres", height: "milieu", from: null }, outro);
  await scene.wait(outro ? 0.4 : 3.6);
  const completed = !scene.isStopped;
  if (player === scene) stopPlayer();
  else scene.stop();
  patchStory(story.view, { status: "done" }, false);
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
  patchStory(story.view, { status: paused ? "paused" : "playing" });
}

/** La croix : arrête l'histoire (ou l'empêche de démarrer si elle se prépare encore). */
export function stopStory() {
  const story = current;
  if (!story) return;
  cancel(story);
  stopPlayer();
  patchStory(story.view, { status: story.feed?.script.lines.length || story.book ? "done" : "error", message: story.feed || story.book ? undefined : "Histoire arrêtée." }, false);
  // Le vocal en direct attendait la fin de l'histoire : il peut reprendre.
  announceReadingDone();
}

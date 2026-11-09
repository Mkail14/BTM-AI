/**
 * Chanson de Tamilya chantée dans le grand globe plein écran (comme les histoires).
 *
 * Demande de l'utilisateur (2026-11-09) : plus de carte avec une barre de chargement dans la
 * conversation ; le globe s'ouvre tout seul, des messages font patienter dessous, puis il chante
 * en gonflant au rythme de la musique.
 *
 * Une chanson composée est gardée (mémoire + IndexedDB du navigateur) sous l'empreinte de ses
 * paroles : la relancer rejoue la même, au lieu d'en recomposer une autre (et de dépenser une
 * chanson du quota). Module côté navigateur uniquement.
 */

import { setVoiceLevelSource } from "@/lib/chat/voice-level";
import { unlockAudio } from "@/lib/lecture/stage";

export type SongView = {
  key: string;
  /** ready : prête, mais le navigateur attend un toucher pour lancer le son. */
  status: "preparing" | "ready" | "playing" | "paused" | "error";
  message?: string;
};

type Snapshot = { active: SongView | null };

let snapshot: Snapshot = { active: null };
const emptySnapshot: Snapshot = { active: null };
const listeners = new Set<() => void>();

export function subscribeSong(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export const getSong = () => snapshot;
export const getServerSong = () => emptySnapshot;

function show(view: SongView | null) {
  snapshot = { active: view };
  for (const listener of listeners) listener();
}
function patch(key: string, next: Partial<SongView>) {
  if (snapshot.active?.key !== key) return; // fermé entre-temps
  show({ ...snapshot.active, ...next });
}

/** Empreinte courte des paroles : même chanson, même clé. */
export function songKey(spec: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < spec.length; i++) h = Math.imul(h ^ spec.charCodeAt(i), 0x01000193);
  return `chanson-${(h >>> 0).toString(36)}-${spec.length}`;
}

// --- Garde des chansons déjà composées -------------------------------------------------

const memory = new Map<string, Blob>();
const DB = "tamilya-chansons";
const STORE = "chansons";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function loadSaved(key: string): Promise<Blob | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE).objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function save(key: string, blob: Blob) {
  const db = await openDb();
  try {
    db?.transaction(STORE, "readwrite").objectStore(STORE).put(blob, key);
  } catch {
    // Stockage plein ou bloqué : la chanson reste en mémoire pour cette visite.
  }
}

/** Chansons déjà composées sur cet appareil (pour le bouton de la conversation). */
export async function hasSavedSong(key: string): Promise<boolean> {
  return memory.has(key) || (await loadSaved(key)) !== null;
}

// --- Lecture --------------------------------------------------------------------------

let audio: HTMLAudioElement | null = null;
let audioUrl: string | null = null;
let run = 0;

function release() {
  run++;
  setVoiceLevelSource(null);
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio = null;
  }
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
}

async function compose(spec: string): Promise<Blob> {
  const response = await fetch("/api/music", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ spec }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Ma voix chantée ne répond pas : réessaie dans un instant.");
  }
  return response.blob();
}

/** Ouvre le globe et chante (la chanson déjà composée si elle existe, sinon on la compose). */
export function playSong(spec: string) {
  const key = songKey(spec);
  release();
  const mine = run;
  show({ key, status: "preparing" });
  // Le son doit s'ouvrir pendant le geste de la personne : avant toute attente.
  const context = unlockAudio();
  void (async () => {
    let blob = memory.get(key) ?? (await loadSaved(key));
    if (!blob) {
      try {
        blob = await compose(spec);
      } catch (error) {
        if (mine === run) patch(key, { status: "error", message: error instanceof Error ? error.message : "Connexion perdue pendant que je composais : réessaie." });
        return;
      }
      void save(key, blob);
    }
    memory.set(key, blob);
    if (mine !== run) return;
    // Lancée par Tamilya en vocal (pas d'un toucher) : sur iPhone, le son Web Audio peut rester
    // bloqué. On ne branche alors pas la musique dessus, sinon elle jouerait sans aucun bruit.
    if (context.state !== "running") await Promise.race([context.resume().catch(() => {}), new Promise((resolve) => setTimeout(resolve, 300))]);
    if (mine !== run) return;

    audioUrl = URL.createObjectURL(blob);
    const element = new Audio(audioUrl);
    audio = element;
    try {
      if (context.state !== "running") throw new Error("son bloqué");
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaElementSource(element).connect(analyser);
      analyser.connect(context.destination);
      const data = new Uint8Array(analyser.fftSize);
      setVoiceLevelSource(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += ((v - 128) / 128) ** 2;
        return Math.min(1, Math.sqrt(sum / data.length) * 4);
      });
    } catch {
      // Sans Web Audio, la musique joue quand même ; le globe bouge sans suivre le volume.
    }
    element.onplay = () => patch(key, { status: "playing" });
    element.onpause = () => {
      if (!element.ended) patch(key, { status: "paused" });
    };
    element.onended = () => {
      if (mine === run) stopSong();
    };
    element.play().catch(() => patch(key, { status: "ready" }));
  })();
}

const started = new Set<string>();
/** Une seule fois par chanson, même si le message de la conversation est redessiné. */
export function playSongOnce(spec: string) {
  const key = songKey(spec);
  if (started.has(key)) return;
  started.add(key);
  playSong(spec);
}

/** Toucher le globe : pause ou reprise. */
export function toggleSong() {
  if (!audio) return;
  unlockAudio();
  if (audio.paused) void audio.play().catch(() => {});
  else audio.pause();
}

export function stopSong() {
  release();
  show(null);
}

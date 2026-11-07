/**
 * Les dernières phrases dites par la personne pendant l'appel vocal, pour
 * vérifier sa voix au moment de payer (voir voice-check.ts).
 *
 * Le son reste dans cette page : à la fin de chaque phrase, son empreinte est
 * calculée en arrière-plan (le paiement n'attend donc pas), puis le son est
 * oublié. Rien n'est gardé au-delà de WINDOW_MS, ni après l'appel.
 */

import { loadPrinter, MIN_SAMPLES, type VoicePrinter } from "./speaker";
import type { VoiceSample } from "./voice-check";

const RATE = 16000;
/** Un blanc plus long sépare deux phrases (deux personnes se répondent rarement plus vite). */
const GAP_MS = 600;
/** Au-delà, une phrase ne compte plus pour le paiement. */
export const WINDOW_MS = 30_000;
/** Une phrase très longue est coupée : le calcul reste court sur téléphone. */
const MAX_SAMPLES = 6 * RATE;

type Phrase = { end: number; chunks: Float32Array[]; length: number; print?: Promise<number[] | null>; seconds: number };

let phrases: Phrase[] = [];
let printer: Promise<VoicePrinter | null> | null = null;

/** La personne a une voix inscrite : on prépare les empreintes au fil de l'appel. */
export function enableVoiceCheck() {
  printer ??= loadPrinter();
}

/** Début d'appel : si le compte a une voix inscrite, le modèle se charge en arrière-plan (≈ 7 Mo, en cache ensuite). */
export function prepareVoiceCheck() {
  void fetch("/api/voice/print", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<{ enrolled?: boolean }>) : null))
    .then((body) => {
      if (body?.enrolled) enableVoiceCheck();
    })
    .catch(() => null);
}

function seal(phrase: Phrase) {
  if (phrase.print || !printer) return;
  const samples = new Float32Array(phrase.length);
  let at = 0;
  for (const chunk of phrase.chunks) {
    samples.set(chunk, at);
    at += chunk.length;
  }
  phrase.chunks = [];
  phrase.print = printer.then((p) => (p && samples.length >= MIN_SAMPLES ? p(samples) : null)).catch(() => null);
}

/** Chaque paquet du micro (16 kHz), avec « c'est de la parole de la personne » ou non. */
export function keepSpeech(samples: Float32Array, speech: boolean, now = performance.now()) {
  // Pas de voix inscrite : rien n'est gardé.
  if (!printer) return;
  const last = phrases.at(-1);
  if (!speech) {
    if (last && !last.print && now - last.end > GAP_MS) seal(last);
    return;
  }
  if (last && !last.print && now - last.end <= GAP_MS && last.length < MAX_SAMPLES) {
    last.chunks.push(samples);
    last.length += samples.length;
    last.seconds = last.length / RATE;
    last.end = now;
  } else {
    if (last && !last.print) seal(last);
    phrases.push({ end: now, chunks: [samples], length: samples.length, seconds: samples.length / RATE });
  }
  phrases = phrases.filter((p) => now - p.end <= WINDOW_MS);
}

/** Les empreintes des phrases dites depuis `since` (horloge performance.now). Null si le modèle n'a pas pu se charger. */
export async function voiceSample(since: number, now = performance.now()): Promise<VoiceSample | null> {
  if (!printer || !(await printer)) return null;
  const recent = phrases.filter((p) => p.end >= since && now - p.end <= WINDOW_MS);
  recent.forEach(seal);
  const parts: VoiceSample["parts"] = [];
  for (const phrase of recent) {
    const print = await phrase.print;
    if (print) parts.push({ print, seconds: Math.round(phrase.seconds * 100) / 100 });
  }
  return { parts };
}

/** Fin d'appel : tout est oublié. */
export function forgetSpeech() {
  phrases = [];
}

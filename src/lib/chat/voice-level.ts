/**
 * « Niveau de voix » d'Awa, de 0 à 1, pour animer son globe comme une bouche.
 *
 * La synthèse vocale du navigateur ne donne pas accès au son : on ne connaît
 * que les mots, au moment où ils sont prononcés (onboundary). Chaque mot est
 * découpé en syllabes ; chacune devient une impulsion (attaque rapide, retombée
 * douce), plus forte sur les voyelles ouvertes (a, o) et sur la dernière
 * syllabe (l'accent du français). Les virgules et les points font des pauses.
 * Si le navigateur ne signale pas les mots (certaines voix en ligne), le texte
 * est parcouru à la vitesse moyenne de la parole.
 *
 * La personne qui parle (dictée) donne aussi de petites impulsions : le globe
 * montre qu'il écoute. Module côté navigateur uniquement.
 */

export type VoiceMood = "idle" | "listening" | "speaking";

type Pulse = { at: number; strength: number };

/** Vitesse moyenne de la parole lue : caractères par seconde. */
const CHARS_PER_SECOND = 14;
/** Sans signal de mot pendant ce temps, le texte est parcouru à la vitesse moyenne. */
const FALLBACK_AFTER_MS = 380;
const ATTACK_MS = 45;
const DECAY_MS = 190;

let mood: VoiceMood = "idle";
let pulses: Pulse[] = [];
let text = "";
let cursor = 0;
let lastWordAt = 0;
let lastFallbackAt = 0;
const listeners = new Set<() => void>();

const now = () => performance.now();

function setMood(next: VoiceMood) {
  if (mood === next) return;
  mood = next;
  listeners.forEach((listener) => listener());
}

/** Syllabes approximatives d'un mot : un groupe de voyelles = une syllabe (le « e » muet final ne compte pas). */
function syllables(word: string): string[] {
  const clean = word.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  if (!clean) return [];
  const groups = clean.replace(/e(s|nt)?$/, "").match(/[^aeiouy]*[aeiouy]+/g) ?? [clean];
  return groups.length ? groups : [clean];
}

/** Programme les syllabes d'un mot à partir de maintenant ; renvoie la durée du mot. */
function scheduleWord(word: string, start: number): number {
  const parts = syllables(word);
  let t = start;
  parts.forEach((syllable, i) => {
    const open = /[ao]/.test(syllable) ? 1 : /[eu]/.test(syllable) ? 0.82 : 0.68;
    const stress = i === parts.length - 1 ? 1.15 : 1;
    pulses.push({ at: t, strength: Math.min(1, open * stress * (0.75 + Math.random() * 0.35)) });
    // Une syllabe dure 130 à 210 ms, un peu plus si elle est longue.
    t += 130 + syllable.length * 12 + Math.random() * 50;
  });
  return t - start;
}

/** Awa commence à lire `spoken`. */
export function voiceSpeakStart(spoken: string) {
  text = spoken;
  cursor = 0;
  pulses = [];
  lastWordAt = 0;
  lastFallbackAt = now();
  setMood("speaking");
}

/** Le navigateur commence à prononcer le mot à `charIndex` dans `part` (un morceau du texte lu). */
export function voiceWord(part: string, charIndex: number) {
  const word = part.slice(charIndex).match(/^[^\s.,;:!?…]+/)?.[0] ?? "";
  lastWordAt = now();
  if (word) scheduleWord(word, lastWordAt);
  const found = text.indexOf(word, cursor);
  if (found >= 0) cursor = found + word.length;
}

/** Awa a fini (ou a été coupée). */
export function voiceSpeakEnd() {
  pulses = [];
  setMood("idle");
}

/** La personne parle (texte dicté qui grandit) : petites impulsions d'écoute. */
export function voiceHeard(addedChars: number) {
  if (mood !== "speaking") setMood("listening");
  const t = now();
  const count = Math.max(1, Math.min(4, Math.round(addedChars / 4)));
  for (let i = 0; i < count; i++) pulses.push({ at: t + i * 150, strength: 0.35 + Math.random() * 0.3 });
}

/** Fin de l'écoute (sans qu'Awa parle). */
export function voiceListenEnd() {
  if (mood === "listening") setMood("idle");
}

export const getVoiceMood = () => mood;

export function subscribeVoiceMood(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Lecture sans signal de mot : on avance dans le texte à la vitesse moyenne et on programme les mots. */
function fallback(t: number) {
  if (mood !== "speaking" || t - lastWordAt < FALLBACK_AFTER_MS || t < lastFallbackAt || cursor >= text.length) return;
  const rest = text.slice(cursor);
  const match = rest.match(/^(\s*)([^\s]+)/);
  if (!match) {
    cursor = text.length;
    return;
  }
  const word = match[2];
  cursor += match[0].length;
  const duration = scheduleWord(word, t);
  // Pause après la ponctuation, comme à l'oral.
  const pause = /[.!?…]$/.test(word) ? 380 : /[,;:]$/.test(word) ? 200 : 40;
  lastFallbackAt = t + Math.max(duration, (word.length / CHARS_PER_SECOND) * 1000) + pause;
}

/** Niveau de voix maintenant, de 0 à 1 (à lire à chaque image). */
export function voiceLevel(): number {
  const t = now();
  fallback(t);
  let level = 0;
  pulses = pulses.filter((p) => t - p.at < ATTACK_MS + DECAY_MS * 3);
  for (const p of pulses) {
    const dt = t - p.at;
    if (dt < 0) continue;
    const env = dt < ATTACK_MS ? dt / ATTACK_MS : Math.exp(-(dt - ATTACK_MS) / DECAY_MS);
    level = Math.max(level, p.strength * env);
  }
  return level;
}

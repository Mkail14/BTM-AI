/**
 * Chronométrage du mode vocal, étape par étape, sur l'appareil qui parle à
 * Tamilya. Le départ est la fin de la phrase de la personne (fin de la dictée).
 * Les 50 derniers échanges sont gardés dans ce navigateur et résumés
 * (médiane, P90, P95) sur /admin/voix. Rien n'est envoyé au serveur.
 */

export const VOICE_STEPS = [
  { id: "sent", label: "Message envoyé au serveur" },
  { id: "firstToken", label: "Premier mot de Gemini reçu (TTFT)" },
  { id: "firstSentence", label: "Première phrase complète reçue" },
  { id: "audioReady", label: "Premier son reçu (TTFA)" },
  { id: "audioStart", label: "Tamilya commence à parler" },
] as const;

export type VoiceStep = (typeof VOICE_STEPS)[number]["id"];

export type VoiceTurn = {
  at: number;
  /** Millisecondes depuis la fin de la phrase, par étape. */
  steps: Partial<Record<VoiceStep, number>>;
  /** Mesures du serveur : premier mot du modèle et fabrication de la première voix. */
  server: { firstTokenMs?: number; ttsMs?: number };
  /** La voix du navigateur a remplacé Gemini. */
  fallback?: boolean;
};

const KEY = "tamilya-voice-metrics";
const MAX_TURNS = 50;

let current: VoiceTurn | null = null;
let startedAt = 0;

/** Fin de la phrase de la personne : départ du chronomètre. */
export function beginVoiceTurn() {
  startedAt = performance.now();
  current = { at: Date.now(), steps: {}, server: {} };
}

/** Étape atteinte (seule la première fois compte). */
export function markVoice(step: VoiceStep) {
  if (!current || current.steps[step] !== undefined) return;
  current.steps[step] = Math.round(performance.now() - startedAt);
  if (step === "audioStart") commit();
}

/** Mesures du serveur : seule la première de chaque sorte compte (la première phrase). */
export function markVoiceServer(values: VoiceTurn["server"]) {
  if (!current) return;
  for (const key of ["firstTokenMs", "ttsMs"] as const) {
    if (values[key] !== undefined && current.server[key] === undefined) current.server[key] = values[key];
  }
}

export function markVoiceFallback() {
  if (current) current.fallback = true;
}

export function readVoiceTurns(): VoiceTurn[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? (raw as VoiceTurn[]) : [];
  } catch {
    return [];
  }
}

export function clearVoiceTurns() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Stockage indisponible (navigation privée) : rien à effacer.
  }
}

function commit() {
  const turn = current;
  current = null;
  if (!turn) return;
  try {
    localStorage.setItem(KEY, JSON.stringify([...readVoiceTurns(), turn].slice(-MAX_TURNS)));
  } catch {
    // Stockage indisponible : la mesure est perdue, la conversation continue.
  }
}

/** Centile p (0–100) d'une liste de durées. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

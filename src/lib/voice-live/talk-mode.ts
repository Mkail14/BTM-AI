/**
 * Façon de parler à Tamilya en vocal direct, choisie à la première utilisation
 * et modifiable dans les paramètres. Le choix est gardé sur l'appareil.
 */
export type TalkMode = "hold" | "free";

export const TALK_MODES: { id: TalkMode; title: string; detail: string }[] = [
  { id: "hold", title: "Maintenir pour parler", detail: "Tu appuies sur le bouton quand tu parles. Elle répond dès que tu lâches." },
  { id: "free", title: "Parler sans bouton", detail: "Tu parles normalement. Elle t'écoute toute seule." },
];

const KEY = "tamilya-vocal-mode";
const listeners = new Set<() => void>();
/** Secours si le navigateur refuse le stockage (navigation privée). */
let memory: TalkMode | null = null;

export function readTalkMode(): TalkMode | null {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "hold" || saved === "free") return saved;
  } catch {}
  return memory;
}

export function saveTalkMode(mode: TalkMode) {
  memory = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {}
  listeners.forEach((listener) => listener());
}

export function subscribeTalkMode(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

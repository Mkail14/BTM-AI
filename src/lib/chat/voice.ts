// Sinon (pas français) : shimaoré, lu par une voix swahili, langue bantoue proche.
import { looksFrench, splitUnknownWords } from "@/lib/language/unknown-words";
import { voiceSpeakEnd, voiceSpeakStart, voiceWord } from "./voice-level";

/**
 * Voix du chat, entièrement dans le navigateur (Web Speech API) : dictée en
 * français et lecture des réponses de Tamilya. Chrome, Edge et Safari ; Firefox
 * n'a pas la dictée.
 */

type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: RecognitionResultList }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type RecognitionConstructor = new () => Recognition;

function recognitionConstructor(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function isVoiceSupported(): boolean {
  return recognitionConstructor() !== null && "speechSynthesis" in window;
}

export type Dictation = { stop(): void; cancel(): void };

/**
 * Écoute une phrase : `onText` reçoit le texte au fil de la parole, `onEnd`
 * le texte final quand la personne se tait (vide si rien n'a été compris).
 */
export function listen({
  onText,
  onEnd,
  onError,
}: {
  onText: (text: string) => void;
  onEnd: (text: string) => void;
  onError: (error: string) => void;
}): Dictation | null {
  const Ctor = recognitionConstructor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "fr-FR";
  recognition.continuous = false;
  recognition.interimResults = true;

  let text = "";
  let cancelled = false;
  recognition.onresult = (event) => {
    text = Array.from(event.results, (result) => result[0]?.transcript ?? "").join("").trim();
    onText(text);
  };
  recognition.onerror = (event) => {
    // « no-speech » : silence, ce n'est pas une erreur à montrer.
    if (event.error !== "no-speech" && event.error !== "aborted") onError(event.error);
  };
  recognition.onend = () => {
    if (!cancelled) onEnd(text);
  };
  recognition.start();

  return {
    stop: () => recognition.stop(),
    cancel: () => {
      cancelled = true;
      recognition.abort();
    },
  };
}

/** Texte lisible à voix haute : sans Markdown, liens, code ni emojis. */
export function speakableText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(?:#{1,6}|[-*+]|\d+[.)]|>)\s+/gm, "")
    .replace(/[*_~|]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang));
  // Les voix « naturelles » ou en ligne (Edge, Chrome, iOS) sonnent bien mieux.
  return voices.find((v) => /natural|online|google|premium|enhanced/i.test(v.name)) ?? voices[0];
}


/**
 * Lit la réponse : le shimaoré avec une voix swahili si l'appareil en a une
 * (Edge : voix « naturelles » Rehema, Zuri…), le français et les [[mots
 * inconnus]] avec une voix française. `onWord` à chaque mot prononcé
 * (animation du globe), `onDone` à la fin ou si la lecture échoue.
 * Renvoie de quoi couper la parole.
 */
function browserSpeak(text: string, { onWord, onDone }: SpeakOptions): () => void {
  const synth = window.speechSynthesis;
  synth.cancel();
  const parts = splitUnknownWords(text)
    .map((segment) => ({ text: speakableText(segment.text), french: segment.french || looksFrench(segment.text) }))
    .filter((part) => part.text);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    voiceSpeakEnd();
    onDone();
  };
  if (parts.length === 0) {
    done();
    return () => {};
  }
  // Le globe de Tamilya suit la lecture, syllabe par syllabe (voice-level.ts).
  voiceSpeakStart(parts.map((part) => part.text).join(" "));

  const french = pickVoice("fr");
  const shimaore = pickVoice("sw") ?? french;
  parts.forEach((part, index) => {
    const utterance = new SpeechSynthesisUtterance(part.text);
    const voice = part.french ? french : shimaore;
    utterance.lang = voice?.lang ?? "fr-FR";
    if (voice) utterance.voice = voice;
    utterance.onboundary = (event) => {
      if (event.name !== "word") return;
      voiceWord(part.text, event.charIndex);
      onWord?.();
    };
    if (index === parts.length - 1) utterance.onend = done;
    utterance.onerror = done;
    synth.speak(utterance);
  });
  return () => {
    finished = true;
    voiceSpeakEnd();
    synth.cancel();
  };
}

type SpeakOptions = { onWord?: () => void; onDone: () => void };

/** Après un échec de la voix Gemini, voix du navigateur pendant ce temps-là (pas d’attente à chaque réponse). */
const GEMINI_PAUSE_MS = 60_000;
/** Délai pour recevoir le son de Gemini avant de parler avec la voix du navigateur. */
const GEMINI_WAIT_MS = 15_000;
let geminiPausedUntil = 0;
/** Lecteur unique, débloqué au toucher du micro (iPhone). */
let player: HTMLAudioElement | null = null;

const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

/**
 * Lit la réponse avec la voix Gemini de Tamilya (choisie dans /admin/voix) ;
 * si elle ne répond pas (pas connecté, quota, réseau), avec la voix du
 * navigateur. Mêmes rappels dans les deux cas. Renvoie de quoi couper la parole.
 */
export function speak(text: string, options: SpeakOptions): () => void {
  const spoken = splitUnknownWords(text)
    .map((segment) => speakableText(segment.text))
    .filter(Boolean)
    .join(" ");
  if (!spoken || Date.now() < geminiPausedUntil || typeof Audio === "undefined") return browserSpeak(text, options);

  window.speechSynthesis?.cancel();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_WAIT_MS);
  let stopFallback: (() => void) | null = null;
  let stopped = false;
  let finished = false;
  const audio = player ?? new Audio();
  let url: string | null = null;

  const cleanUp = () => {
    clearTimeout(timer);
    audio.onended = audio.onerror = audio.ontimeupdate = null;
    if (url) URL.revokeObjectURL(url);
    url = null;
  };
  const done = () => {
    if (finished) return;
    finished = true;
    cleanUp();
    voiceSpeakEnd();
    options.onDone();
  };
  const fallback = () => {
    if (stopped || finished) return;
    cleanUp();
    geminiPausedUntil = Date.now() + GEMINI_PAUSE_MS;
    stopFallback = browserSpeak(text, options);
  };

  void (async () => {
    try {
      const response = await fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: spoken.slice(0, 2000) }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`voix ${response.status}`);
      const blob = await response.blob();
      if (stopped) return;
      clearTimeout(timer);
      url = URL.createObjectURL(blob);
      audio.src = url;
      // Le globe suit la voix : un « mot » à chaque espace franchi au fil du son.
      voiceSpeakStart(spoken);
      let lastIndex = -1;
      audio.ontimeupdate = () => {
        if (!audio.duration || !Number.isFinite(audio.duration)) return;
        const at = Math.floor((audio.currentTime / audio.duration) * spoken.length);
        const index = spoken.lastIndexOf(" ", at) + 1;
        if (index === lastIndex) return;
        lastIndex = index;
        voiceWord(spoken, index);
        options.onWord?.();
      };
      audio.onended = done;
      audio.onerror = fallback;
      await audio.play();
    } catch (error) {
      if (!stopped) console.info("[voix] Voix Gemini indisponible, voix du navigateur", error);
      fallback();
    }
  })();

  return () => {
    stopped = true;
    finished = true;
    controller.abort();
    audio.pause();
    cleanUp();
    stopFallback?.();
    voiceSpeakEnd();
  };
}

/** iOS n’autorise la lecture qu’après un geste : à appeler au toucher du micro. */
export function unlockSpeech() {
  if (typeof window === "undefined") return;
  if (typeof Audio !== "undefined") {
    player ??= new Audio();
    player.src = SILENT_WAV;
    void player.play().catch(() => {});
  }
  if ("speechSynthesis" in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

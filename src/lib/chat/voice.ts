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
  try {
    recognition.start();
  } catch {
    // Chrome : l'écoute précédente n'est pas encore fermée. On réessaie juste après.
    setTimeout(() => {
      if (cancelled) return;
      try {
        recognition.start();
      } catch {
        onError("busy");
      }
    }, 500);
  }

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

/** Première phrase seule (elle part vite), puis des morceaux d'environ 200 caractères. */
export function speechChunks(text: string): string[] {
  const sentences = (text.match(/[^.!?…]+(?:[.!?…]+["»)]*|$)/g) ?? [text]).map((s) => s.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const last = chunks.at(-1);
    // Le premier morceau reste court (au moins 30 caractères) ; les suivants vont jusqu'à 200.
    if (last !== undefined && (last.length < 30 || (chunks.length > 1 && last.length + sentence.length <= 200))) {
      chunks[chunks.length - 1] = `${last} ${sentence}`;
    } else chunks.push(sentence);
  }
  return chunks;
}

/** Morceaux téléchargés en avance pendant que le précédent est lu. */
const PREFETCH = 2;

async function fetchSpeech(text: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch("/api/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 2000) }),
    signal,
  });
  if (!response.ok) throw new Error(`voix ${response.status}`);
  return response.blob();
}

/**
 * Lit la réponse avec la voix Gemini de Tamilya (choisie dans /admin/voix),
 * phrase par phrase : la première est demandée seule pour parler vite, les
 * suivantes se préparent pendant la lecture. Si Gemini ne répond pas (pas
 * connecté, quota, réseau), la voix du navigateur prend la suite. Mêmes
 * rappels dans les deux cas. Renvoie de quoi couper la parole.
 */
export function speak(text: string, options: SpeakOptions): () => void {
  const spoken = splitUnknownWords(text)
    .map((segment) => speakableText(segment.text))
    .filter(Boolean)
    .join(" ");
  if (!spoken || Date.now() < geminiPausedUntil || typeof Audio === "undefined") return browserSpeak(text, options);

  window.speechSynthesis?.cancel();
  const chunks = speechChunks(spoken);
  const controller = new AbortController();
  const requests: Promise<Blob>[] = [];
  const request = (index: number) => {
    if (index < chunks.length) requests[index] ??= fetchSpeech(chunks[index], controller.signal);
    return requests[index];
  };
  const audio = player ?? new Audio();
  let stopFallback: (() => void) | null = null;
  let stopped = false;
  let url: string | null = null;

  const release = () => {
    audio.onended = audio.onerror = audio.ontimeupdate = null;
    if (url) URL.revokeObjectURL(url);
    url = null;
  };
  const finish = () => {
    if (stopped) return;
    stopped = true;
    release();
    voiceSpeakEnd();
    options.onDone();
  };

  /** Lit un morceau jusqu'au bout ; le globe suit la voix, un « mot » à chaque espace franchi. */
  const play = (blob: Blob, offset: number, chunk: string) =>
    new Promise<void>((resolve, reject) => {
      release();
      url = URL.createObjectURL(blob);
      audio.src = url;
      let lastIndex = -1;
      audio.ontimeupdate = () => {
        if (!audio.duration || !Number.isFinite(audio.duration)) return;
        const at = Math.floor((audio.currentTime / audio.duration) * chunk.length);
        const index = chunk.lastIndexOf(" ", at) + 1;
        if (index === lastIndex) return;
        lastIndex = index;
        voiceWord(spoken, offset + index);
        options.onWord?.();
      };
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("lecture"));
      audio.play().catch(reject);
    });

  void (async () => {
    const timer = setTimeout(() => controller.abort(), GEMINI_WAIT_MS);
    let index = 0;
    try {
      for (let i = 0; i < PREFETCH; i++) void request(i)?.catch(() => {});
      let offset = 0;
      for (; index < chunks.length; index++) {
        const blob = await request(index);
        if (index === 0) {
          clearTimeout(timer);
          voiceSpeakStart(spoken);
        }
        if (stopped) return;
        void request(index + PREFETCH)?.catch(() => {});
        await play(blob, offset, chunks[index]);
        offset += chunks[index].length + 1;
      }
      finish();
    } catch (error) {
      clearTimeout(timer);
      if (stopped) return;
      console.info("[voix] Voix Gemini indisponible, voix du navigateur", error);
      geminiPausedUntil = Date.now() + GEMINI_PAUSE_MS;
      release();
      // La voix du navigateur reprend là où Gemini s'est arrêté.
      const rest = index === 0 ? text : chunks.slice(index).join(" ");
      stopFallback = browserSpeak(rest, {
        onWord: options.onWord,
        onDone: () => {
          if (stopped) return;
          stopped = true;
          options.onDone();
        },
      });
    }
  })();

  return () => {
    stopped = true;
    controller.abort();
    audio.pause();
    release();
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

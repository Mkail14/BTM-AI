// Sinon (pas français) : shimaoré, lu par une voix swahili, langue bantoue proche.
import { looksFrench, splitUnknownWords } from "@/lib/language/unknown-words";
import { voiceSpeakEnd, voiceSpeakStart, voiceWord } from "./voice-level";
import { markVoice, markVoiceFallback, markVoiceServer } from "./voice-metrics";

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

/** Silence après le dernier mot entendu avant d'envoyer la phrase. */
const END_OF_SPEECH_MS = 800;

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
  // Fin de phrase : 0,8 s sans nouveau mot suffit, sans attendre que Chrome conclue de lui-même (1 à 2 s).
  let silence: ReturnType<typeof setTimeout> | null = null;
  recognition.onresult = (event) => {
    text = Array.from(event.results, (result) => result[0]?.transcript ?? "").join("").trim();
    onText(text);
    if (silence) clearTimeout(silence);
    if (text) silence = setTimeout(() => recognition.stop(), END_OF_SPEECH_MS);
  };
  recognition.onerror = (event) => {
    // « no-speech » : silence, ce n'est pas une erreur à montrer.
    if (event.error !== "no-speech" && event.error !== "aborted") onError(event.error);
  };
  recognition.onend = () => {
    if (silence) clearTimeout(silence);
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

/** Phrases demandées à Gemini en même temps, au plus (les suivantes attendent leur tour). */
const PREFETCH = 2;

type SpeechAudio = { blob: Blob; serverMs: number | undefined };

async function fetchSpeech(text: string, signal: AbortSignal): Promise<SpeechAudio> {
  const response = await fetch("/api/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 2000) }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(GEMINI_WAIT_MS)]),
  });
  if (!response.ok) throw new Error(`voix ${response.status}`);
  const serverMs = Number(response.headers.get("x-voice-ms")) || undefined;
  return { blob: await response.blob(), serverMs };
}

/** Texte prononçable d'un morceau de réponse (sans Markdown ni [[ ]]). */
const spokenOf = (raw: string) =>
  splitUnknownWords(raw)
    .map((segment) => speakableText(segment.text))
    .filter(Boolean)
    .join(" ");

export type Speaker = {
  /** Ajoute une phrase à dire ; la lecture commence dès la première. */
  add(text: string): void;
  /** Plus rien à ajouter : onDone quand la dernière phrase est dite. */
  end(): void;
  /** Coupe la parole. */
  stop(): void;
};

/**
 * Voix de Tamilya au fil de la réponse : chaque phrase ajoutée est demandée
 * tout de suite à Gemini (voix choisie dans /admin/voix) et lue dès que la
 * précédente est finie. Si Gemini ne répond pas (pas connecté, quota,
 * réseau), la voix du navigateur prend la suite.
 */
export function createSpeaker(options: SpeakOptions): Speaker {
  const controller = new AbortController();
  type Item = { raw: string; text: string; audio: Promise<SpeechAudio> | null };
  const queue: Item[] = [];
  let browser = typeof Audio === "undefined" || Date.now() < geminiPausedUntil;
  let ended = false;
  let stopped = false;
  let playing = false;
  let url: string | null = null;
  let stopBrowser: (() => void) | null = null;
  const audio = browser ? null : (player ??= new Audio());

  // Au plus PREFETCH demandes en cours, dans l'ordre de la file.
  const prefetch = () => {
    if (browser) return;
    for (const item of queue.slice(0, PREFETCH)) {
      if (item.audio) continue;
      item.audio = fetchSpeech(item.text, controller.signal);
      item.audio.catch(() => {});
    }
  };
  const release = () => {
    if (!audio) return;
    audio.onended = audio.onerror = audio.ontimeupdate = audio.onplaying = null;
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

  /** Lit un morceau avec Gemini ; le globe suit la voix, un « mot » à chaque espace franchi. */
  const playBlob = (blob: Blob, text: string) =>
    new Promise<void>((resolve, reject) => {
      if (!audio) return reject(new Error("pas de lecteur"));
      release();
      url = URL.createObjectURL(blob);
      audio.src = url;
      voiceSpeakStart(text);
      let lastIndex = -1;
      audio.ontimeupdate = () => {
        if (!audio.duration || !Number.isFinite(audio.duration)) return;
        const at = Math.floor((audio.currentTime / audio.duration) * text.length);
        const index = text.lastIndexOf(" ", at) + 1;
        if (index === lastIndex) return;
        lastIndex = index;
        voiceWord(text, index);
        options.onWord?.();
      };
      audio.onplaying = () => markVoice("audioStart");
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("lecture"));
      audio.play().catch(reject);
    });

  const playBrowser = (raw: string) =>
    new Promise<void>((resolve) => {
      markVoiceFallback();
      markVoice("audioReady");
      markVoice("audioStart");
      stopBrowser = browserSpeak(raw, { onWord: options.onWord, onDone: resolve });
    });

  const next = async () => {
    if (playing || stopped) return;
    const item = queue[0];
    if (!item) {
      if (ended) finish();
      return;
    }
    playing = true;
    try {
      if (browser || !item.audio) {
        await playBrowser(item.raw);
      } else {
        const { blob, serverMs } = await item.audio;
        if (stopped) return;
        markVoiceServer({ ttsMs: serverMs });
        markVoice("audioReady");
        await playBlob(blob, item.text);
      }
      queue.shift();
    } catch (error) {
      if (stopped) return;
      console.info("[voix] Voix Gemini indisponible, voix du navigateur", error);
      // Cette phrase et les suivantes : voix du navigateur.
      browser = true;
      geminiPausedUntil = Date.now() + GEMINI_PAUSE_MS;
      release();
    } finally {
      playing = false;
    }
    if (stopped) return;
    prefetch();
    void next();
  };

  return {
    add(raw) {
      const text = spokenOf(raw);
      if (stopped || !text) return;
      if (!browser) window.speechSynthesis?.cancel();
      queue.push({ raw, text, audio: null });
      prefetch();
      void next();
    },
    end() {
      ended = true;
      void next();
    },
    stop() {
      stopped = true;
      controller.abort();
      audio?.pause();
      release();
      stopBrowser?.();
      voiceSpeakEnd();
    },
  };
}

/** Lit une réponse entière, phrase par phrase (voir createSpeaker). Renvoie de quoi couper la parole. */
export function speak(text: string, options: SpeakOptions): () => void {
  const speaker = createSpeaker(options);
  for (const chunk of speechChunks(text)) speaker.add(chunk);
  speaker.end();
  return speaker.stop;
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

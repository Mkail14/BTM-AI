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
  onaudiostart?: (() => void) | null;
  onsoundstart?: (() => void) | null;
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
  onEvent,
}: {
  onText: (text: string) => void;
  onEnd: (text: string) => void;
  onError: (error: string) => void;
  /** Diagnostic : le micro capte (audiostart), un son arrive (soundstart). */
  onEvent?: (event: "audiostart" | "soundstart") => void;
}): Dictation | null {
  const Ctor = recognitionConstructor();
  if (!Ctor) return null;
  const recognition = new Ctor();
  recognition.lang = "fr-FR";
  recognition.onaudiostart = () => onEvent?.("audiostart");
  recognition.onsoundstart = () => onEvent?.("soundstart");
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

/**
 * Son reçu du serveur. `blob` : téléchargé en entier d'avance (phrases
 * suivantes) ; null : à jouer pendant qu'il arrive (première phrase).
 */
type SpeechAudio = { response: Response; serverMs: number | undefined; blob: Promise<Blob> | null };

/** Le navigateur sait jouer un MP3 pendant son téléchargement (Chrome, Edge, Android ; pas l'iPhone). */
function canStreamAudio(): boolean {
  return typeof MediaSource !== "undefined" && MediaSource.isTypeSupported("audio/mpeg");
}

async function fetchSpeech(text: string, signal: AbortSignal, streamed: boolean): Promise<SpeechAudio> {
  const response = await fetch("/api/voice/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: text.slice(0, 2000) }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(GEMINI_WAIT_MS)]),
  });
  if (!response.ok) throw new Error(`voix ${response.status}`);
  const serverMs = Number(response.headers.get("x-voice-ms")) || undefined;
  const blob = streamed ? null : response.blob();
  blob?.catch(() => {});
  return { response, serverMs, blob };
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
  /** La première phrase demandée est jouée pendant qu'elle arrive : c'est elle qui fait attendre. */
  let requested = 0;

  // Au plus PREFETCH demandes en cours, dans l'ordre de la file.
  const prefetch = () => {
    if (browser) return;
    for (const item of queue.slice(0, PREFETCH)) {
      if (item.audio) continue;
      item.audio = fetchSpeech(item.text, controller.signal, requested++ === 0 && canStreamAudio());
      item.audio.catch(() => {});
    }
  };
  const release = () => {
    if (!audio) return;
    audio.onended = audio.onerror = audio.ontimeupdate = audio.onplaying = null;
    if (url) URL.revokeObjectURL(url);
    url = null;
  };
  /**
   * Lecteur rendu au système après la réponse : un lecteur qui garde un son
   * chargé (surtout en flux) peut garder la main sur l'audio du téléphone, et
   * Chrome n'entend alors plus rien au micro pour le message suivant.
   */
  const releasePlayer = () => {
    if (!audio) return;
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "none";
  };
  const finish = () => {
    if (stopped) return;
    stopped = true;
    release();
    releasePlayer();
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

  /**
   * Joue le MP3 pendant son téléchargement (MediaSource) : le son démarre dès
   * les premiers octets. Durée inconnue pendant le flux : le globe suit un
   * débit de parole moyen (14 caractères par seconde).
   */
  const playStream = (response: Response, text: string) =>
    new Promise<void>((resolve, reject) => {
      const body = response.body;
      if (!audio || !body) return reject(new Error("pas de flux"));
      release();
      const source = new MediaSource();
      url = URL.createObjectURL(source);
      audio.src = url;
      voiceSpeakStart(text);
      let lastIndex = -1;
      audio.ontimeupdate = () => {
        const at = Math.min(text.length, Math.floor(audio.currentTime * 14));
        const index = text.lastIndexOf(" ", at) + 1;
        if (index === lastIndex) return;
        lastIndex = index;
        voiceWord(text, index);
        options.onWord?.();
      };
      // Fin de lecture : l'évènement « ended » ne vient pas toujours avec un son en flux. On
      // conclut aussi quand la lecture atteint la fin, ou au plus tard 2 s après la fin prévue.
      let settled = false;
      let streamDone = false;
      let guard: ReturnType<typeof setTimeout> | null = null;
      const done = () => {
        if (settled) return;
        settled = true;
        if (guard) clearTimeout(guard);
        resolve();
      };
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        if (guard) clearTimeout(guard);
        reject(error);
      };
      const armGuard = () => {
        if (guard) clearTimeout(guard);
        const left = Number.isFinite(audio.duration) ? Math.max(0, audio.duration - audio.currentTime) : 10;
        guard = setTimeout(done, left * 1000 + 2000);
      };
      const watchEnd = audio.ontimeupdate;
      audio.ontimeupdate = (event) => {
        watchEnd?.call(audio, event);
        if (streamDone && Number.isFinite(audio.duration) && audio.currentTime >= audio.duration - 0.15) done();
      };
      audio.onplaying = () => {
        markVoice("audioStart");
        if (streamDone) armGuard();
      };
      audio.onended = done;
      audio.onerror = () => fail(new Error("lecture"));
      source.addEventListener(
        "sourceopen",
        () => {
          void (async () => {
            const buffer = source.addSourceBuffer("audio/mpeg");
            const reader = body.getReader();
            const append = (chunk: Uint8Array) =>
              new Promise<void>((done, fail) => {
                buffer.addEventListener("updateend", () => done(), { once: true });
                buffer.addEventListener("error", () => fail(new Error("tampon")), { once: true });
                buffer.appendBuffer(chunk as BufferSource);
              });
            let started = false;
            try {
              for (;;) {
                const { value, done } = await reader.read();
                if (stopped) return void reader.cancel().catch(() => {});
                if (done) break;
                if (!value?.length) continue;
                await append(value);
                if (!started) {
                  started = true;
                  markVoice("audioReady");
                  audio.play().catch(fail);
                }
              }
              if (!started) return fail(new Error("son vide"));
              if (source.readyState === "open") source.endOfStream();
              streamDone = true;
              armGuard();
            } catch (error) {
              fail(error);
            }
          })();
        },
        { once: true },
      );
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
        const { response, serverMs, blob } = await item.audio;
        if (stopped) return;
        markVoiceServer({ ttsMs: serverMs });
        if (blob) {
          const ready = await blob;
          if (stopped) return;
          markVoice("audioReady");
          await playBlob(ready, item.text);
        } else await playStream(response, item.text);
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
      release();
      releasePlayer();
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

/** iPhone et iPad (iPadOS se présente comme un Mac tactile). */
export function isAppleMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/**
 * iPhone : après qu'une page a joué un son, iOS passe l'audio en « lecture » et
 * la dictée n'entend plus rien (1er message entendu, 2e silence). Garder le
 * micro ouvert pendant tout le mode vocal maintient iOS en « écoute et
 * lecture » : les deux marchent ensemble. Renvoie de quoi le refermer.
 */
export async function holdMicrophone(): Promise<() => void> {
  if (!isAppleMobile() || !navigator.mediaDevices?.getUserMedia) return () => {};
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    return () => stream.getTracks().forEach((track) => track.stop());
  } catch {
    return () => {};
  }
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

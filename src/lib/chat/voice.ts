// Sinon (pas français) : shimaoré, lu par une voix swahili, langue bantoue proche.
import { looksFrench, splitUnknownWords } from "@/lib/language/unknown-words";

/**
 * Voix du chat, entièrement dans le navigateur (Web Speech API) : dictée en
 * français et lecture des réponses d'Awa. Chrome, Edge et Safari ; Firefox
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
export function speak(text: string, { onWord, onDone }: { onWord?: () => void; onDone: () => void }): () => void {
  const synth = window.speechSynthesis;
  synth.cancel();
  const parts = splitUnknownWords(text)
    .map((segment) => ({ text: speakableText(segment.text), french: segment.french || looksFrench(segment.text) }))
    .filter((part) => part.text);
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    onDone();
  };
  if (parts.length === 0) {
    done();
    return () => {};
  }

  const french = pickVoice("fr");
  const shimaore = pickVoice("sw") ?? french;
  parts.forEach((part, index) => {
    const utterance = new SpeechSynthesisUtterance(part.text);
    const voice = part.french ? french : shimaore;
    utterance.lang = voice?.lang ?? "fr-FR";
    if (voice) utterance.voice = voice;
    utterance.onboundary = (event) => {
      if (event.name === "word") onWord?.();
    };
    if (index === parts.length - 1) utterance.onend = done;
    utterance.onerror = done;
    synth.speak(utterance);
  });
  return () => {
    finished = true;
    synth.cancel();
  };
}

/** iOS n'autorise la lecture qu'après un geste : à appeler au toucher du micro. */
export function unlockSpeech() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
}

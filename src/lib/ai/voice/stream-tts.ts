import "server-only";
import { errorFromStatus } from "../providers/openai-compatible";
import { geminiHeaders, geminiRoot, listKeyModels } from "../providers/gemini";
import { createSseDataParser } from "../sse";
import { AIProviderError } from "../types";
import { cleanSpeech, geminiKey, resting, RESTING_MS, ttsModels } from "./gemini-tts";
import type { GeminiVoiceId } from "./voices";

/**
 * Voix de Tamilya en continu : Gemini envoie le son par morceaux
 * (streamGenerateContent), chaque morceau est nettoyé, compressé en MP3 et
 * transmis aussitôt. Le téléphone commence à jouer dès les premiers octets,
 * au lieu d'attendre la phrase entière. Si Gemini envoie tout d'un coup, on
 * retombe simplement sur un seul morceau, sans rien casser.
 */

const TIMEOUT_MS = 30_000;
const KBPS = 48;

type TtsChunk = { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };

/**
 * Nettoyage au fil de l'eau : les 0,6 premières secondes sont traitées et
 * envoyées dès qu'elles sont là (le son démarre vite) ; la dernière seconde
 * reste en réserve jusqu'à la fin, pour voir la parole qui précède le
 * grésillement final et le couper.
 */
export function createSpeechCleaner(rate: number) {
  const head = Math.round(rate * 0.6);
  const tail = Math.round(rate * 1);
  let pending = new Int16Array(0);
  let headDone = false;
  const concat = (a: Int16Array, b: Int16Array) => {
    const out = new Int16Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
  };
  return {
    push(samples: Int16Array): Int16Array {
      pending = concat(pending, samples);
      if (!headDone) {
        if (pending.length < head) return new Int16Array(0);
        headDone = true;
        const ready = cleanSpeech(pending.slice(0, head), rate, { tail: false });
        pending = pending.slice(head);
        return ready;
      }
      if (pending.length <= tail) return new Int16Array(0);
      const ready = pending.slice(0, pending.length - tail);
      pending = pending.slice(pending.length - tail);
      return ready;
    },
    end(): Int16Array {
      const rest = pending;
      pending = new Int16Array(0);
      return headDone ? cleanSpeech(rest, rate, { lead: false }) : cleanSpeech(rest, rate);
    },
  };
}

/** Octets PCM reçus en base64 → échantillons 16 bits (un octet impair attend le morceau suivant). */
export function createPcmReader() {
  let carry: Uint8Array | null = null;
  return (base64: string): Int16Array => {
    let bytes: Uint8Array = Buffer.from(base64, "base64");
    if (carry) {
      const joined = new Uint8Array(carry.length + bytes.length);
      joined.set(carry);
      joined.set(bytes, carry.length);
      bytes = joined;
      carry = null;
    }
    if (bytes.length % 2) {
      carry = bytes.slice(-1);
      bytes = bytes.slice(0, -1);
    }
    return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
  };
}

export type SpeechStream = {
  stream: ReadableStream<Uint8Array>;
  /** Temps jusqu'au premier son de Gemini, sur le serveur. */
  firstAudioMs: number;
  trace: string;
};

/**
 * Ouvre la voix en continu. Ne rend la main qu'une fois le premier son reçu :
 * une erreur (quota, clé…) arrive donc avant toute réponse, et le navigateur
 * peut passer à sa propre voix.
 */
export async function streamSpeech(text: string, voice: GeminiVoiceId, signal: AbortSignal): Promise<SpeechStream> {
  const started = Date.now();
  const trace: string[] = [];
  const key = await geminiKey();
  // Le signal de la requête ne vaut que jusqu'au premier son : Next l'annule une fois la
  // réponse rendue, ce qui coupait Gemini en plein flux (son vide). Ensuite, c'est
  // l'annulation du flux par le navigateur (cancel) qui arrête Gemini.
  const gemini = new AbortController();
  const timer = setTimeout(() => gemini.abort(), TIMEOUT_MS);
  const onAbort = () => gemini.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const combined = gemini.signal;
  let handedOff = false;
  try {
  const models = ttsModels(await listKeyModels(key, combined));
  const restKey = (model: string) => `${key.apiKey.slice(-8)}:${model}`;
  const ordered = [...new Set([...models.filter((m) => (resting.get(restKey(m)) ?? 0) < Date.now()), ...models])].slice(0, 3);
  let lastError: AIProviderError | null = null;

  for (const model of ordered) {
    const at = Date.now();
    const response = await fetch(`${geminiRoot(key.baseUrl)}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: geminiHeaders(key.apiKey),
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
      }),
      signal: combined,
    }).catch((error: unknown) => {
      if (signal.aborted) throw new AIProviderError("aborted", "Lecture annulée", { cause: error });
      throw new AIProviderError("unavailable", "Connexion à Gemini impossible", { cause: error });
    });
    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      lastError = errorFromStatus(response.status, body);
      trace.push(`${model}:${response.status}`);
      if (response.status === 429 || response.status === 404 || response.status >= 500) {
        resting.set(restKey(model), Date.now() + RESTING_MS);
        continue;
      }
      throw lastError;
    }

    // Lecture des événements jusqu'au premier son (rendu tout de suite), le reste suit dans le flux.
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const sse = createSseDataParser();
    const toPcm = createPcmReader();
    let rate = 24_000;
    let chunks = 0;
    const nextSamples = async (): Promise<Int16Array | null> => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return null;
        const samples: Int16Array[] = [];
        for (const data of sse.push(value)) {
          let json: TtsChunk;
          try {
            json = JSON.parse(data) as TtsChunk;
          } catch {
            continue;
          }
          for (const part of json.candidates?.[0]?.content?.parts ?? []) {
            if (!part.inlineData?.data) continue;
            rate = Number(part.inlineData.mimeType?.match(/rate=(\d+)/)?.[1] ?? rate);
            samples.push(toPcm(part.inlineData.data));
            chunks++;
          }
        }
        if (samples.length) {
          const total = samples.reduce((n, s) => n + s.length, 0);
          const out = new Int16Array(total);
          let offset = 0;
          for (const s of samples) {
            out.set(s, offset);
            offset += s.length;
          }
          return out;
        }
      }
    };

    const first = await nextSamples();
    if (!first) {
      lastError = new AIProviderError("unavailable", `Gemini « ${model} » n'a pas renvoyé de son`);
      trace.push(`${model}:vide`);
      continue;
    }
    const firstAudioMs = Date.now() - started;
    handedOff = true;
    signal.removeEventListener("abort", onAbort);
    trace.push(`${model}:200:${Date.now() - at}ms`);

    const { Mp3Encoder } = await import("@breezystack/lamejs");
    const encoder = new Mp3Encoder(1, rate, KBPS);
    const cleaner = createSpeechCleaner(rate);
    const encode = (samples: Int16Array) => {
      const out: Uint8Array[] = [];
      for (let i = 0; i < samples.length; i += 1152 * 20) {
        const mp3 = encoder.encodeBuffer(samples.subarray(i, i + 1152 * 20));
        if (mp3.length) out.push(mp3);
      }
      return out;
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for (let samples: Int16Array | null = first; samples; samples = await nextSamples()) {
            for (const mp3 of encode(cleaner.push(samples))) controller.enqueue(mp3);
          }
          for (const mp3 of encode(cleaner.end())) controller.enqueue(mp3);
          const last = encoder.flush();
          if (last.length) controller.enqueue(last);
          console.info(`[voix] ${model} : ${chunks} morceau(x), premier son en ${firstAudioMs} ms`);
        } catch (error) {
          // Coupure en cours de route (annulation, réseau) : le son s'arrête là.
          if (!gemini.signal.aborted) console.error("[voix] Flux interrompu", error);
        } finally {
          clearTimeout(timer);
          controller.close();
        }
      },
      cancel() {
        gemini.abort();
        void reader.cancel().catch(() => {});
      },
    });
    return { stream, firstAudioMs, trace: trace.join(" ") };
  }
  throw lastError ?? new AIProviderError("quota", "Aucun modèle de voix Gemini disponible pour cette clé.");
  } finally {
    if (!handedOff) {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }
}

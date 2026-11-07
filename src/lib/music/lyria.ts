import "server-only";
import { geminiKey } from "@/lib/ai/voice/gemini-tts";
import { geminiHeaders, geminiRoot } from "@/lib/ai/providers/gemini";

/**
 * Chansons de Tamilya avec Lyria (Google), par l'API Gemini : même clé et même crédit que Gemini.
 * Voix chantée et instruments. Pas de chanson existante ni de voix d'artiste (refusé par Google).
 * Documentation : https://aistudio.google.com/docs/music-generation (API « interactions »).
 */

export const LYRIA_MODELS = { clip: "lyria-3-clip-preview", song: "lyria-3.5" } as const;
export type LyriaModel = keyof typeof LYRIA_MODELS;

/** Révision de l'API demandée par la documentation. */
const API_REVISION = "2026-05-20";
/** Un extrait de 30 s se fait en moins d'une minute ; une chanson entière peut prendre plus. */
const TIMEOUT_MS = 110_000;

export type Song = { audio: Buffer; mimeType: string; text: string; model: string; ms: number };

type Block = { type?: string; text?: string; data?: string; mime_type?: string };
type InteractionResponse = { steps?: { type?: string; content?: Block[] }[]; error?: { message?: string; status?: string } };

export class LyriaError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Lit l'audio (base64) et le texte (paroles, structure) de la réponse. */
export function readInteraction(body: InteractionResponse): { audio: Buffer | null; mimeType: string; text: string } {
  let audio: Buffer | null = null;
  let mimeType = "audio/mpeg";
  const text: string[] = [];
  for (const step of body.steps ?? []) {
    if (step.type !== "model_output") continue;
    for (const block of step.content ?? []) {
      if (block.type === "audio" && block.data && !audio) {
        audio = Buffer.from(block.data, "base64");
        if (block.mime_type) mimeType = block.mime_type;
      } else if (block.type === "text" && block.text) text.push(block.text);
    }
  }
  return { audio, mimeType, text: text.join("\n").trim() };
}

/** Demande une chanson à Lyria. prompt : style et paroles (balises [Verse], [Chorus]…). */
export async function generateSong(prompt: string, model: LyriaModel = "clip"): Promise<Song> {
  const { apiKey, baseUrl } = await geminiKey();
  const started = Date.now();
  const response = await fetch(`${geminiRoot(baseUrl)}/interactions`, {
    method: "POST",
    headers: { ...geminiHeaders(apiKey), "Api-Revision": API_REVISION },
    body: JSON.stringify({ model: LYRIA_MODELS[model], input: prompt }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = ((await response.json().catch(() => ({}))) ?? {}) as InteractionResponse;
  if (!response.ok) {
    // Message de Google (refus de contenu, modèle indisponible pour cette clé…) : pas de données personnelles.
    throw new LyriaError(body.error?.message?.slice(0, 300) ?? `Lyria a répondu ${response.status}`, response.status);
  }
  const { audio, mimeType, text } = readInteraction(body);
  if (!audio) throw new LyriaError(text ? `Pas de son, seulement du texte : ${text.slice(0, 200)}` : "Lyria n'a renvoyé aucun son.", 502);
  return { audio, mimeType, text, model: LYRIA_MODELS[model], ms: Date.now() - started };
}

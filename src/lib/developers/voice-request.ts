import { z } from "zod";
import { SPEECH_MAX_CHARS } from "@/lib/ai/voice/voices";

/**
 * Corps de POST /api/v1/tamilya/voice : { "text": "…" } seulement. Tout autre champ est refusé
 * (le choix d'une autre voix reste réservé au site) : c'est toujours la voix de Tamilya.
 */
export const VOICE_MAX_BODY_BYTES = 64 * 1024;

const voiceRequestSchema = z.strictObject({
  text: z.string().trim().min(1).max(SPEECH_MAX_CHARS),
});

export type VoiceRequest = { ok: true; text: string } | { ok: false; status: 400 | 413 };

export function parseVoiceRequest(raw: string): VoiceRequest {
  if (new TextEncoder().encode(raw).length > VOICE_MAX_BODY_BYTES) return { ok: false, status: 413 };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, status: 400 };
  }
  const parsed = voiceRequestSchema.safeParse(json);
  return parsed.success ? { ok: true, text: parsed.data.text } : { ok: false, status: 400 };
}

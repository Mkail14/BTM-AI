"use server";

import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { saveVoice } from "@/lib/ai/voice/settings";
import { GEMINI_VOICES, isGeminiVoice } from "@/lib/ai/voice/voices";

export async function saveVoiceAction(voice: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  if (!isGeminiVoice(voice)) return { ok: false, message: "Voix inconnue." };
  if (!(await saveVoice(voice))) {
    return { ok: false, message: "L'enregistrement a échoué (migration 20261128000000_voix_tamilya.sql appliquée ?)." };
  }
  const label = GEMINI_VOICES.find((v) => v.id === voice)?.label ?? voice;
  return { ok: true, message: `C'est enregistré : Tamilya parle maintenant avec la voix ${label} (partout en moins de 30 secondes).` };
}

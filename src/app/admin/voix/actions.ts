"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { saveVoice } from "@/lib/ai/voice/settings";
import { GEMINI_VOICES, isGeminiVoice } from "@/lib/ai/voice/voices";
import { addVoiceCorrection, removeVoiceCorrection } from "@/lib/voice-live/corrections";
import { CORRECTION_MAX_CHARS } from "@/lib/voice-live/listening";

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

const correctionSchema = z.strictObject({
  heard: z.string().trim().min(2, "Indique ce qui s'est affiché.").max(CORRECTION_MAX_CHARS),
  meant: z.string().trim().min(1, "Indique ce que tu as dit.").max(CORRECTION_MAX_CHARS),
});

export async function addCorrectionAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  if (parsed.data.heard.toLowerCase() === parsed.data.meant.toLowerCase()) return { ok: false, message: "Les deux textes sont identiques." };
  const saved = await addVoiceCorrection(parsed.data.heard, parsed.data.meant, auth.user.id);
  if (saved === "duplicate") return { ok: false, message: "Ce mot est déjà dans la liste : retire-le d'abord pour le changer." };
  if (saved === "failed") return { ok: false, message: "Correction non enregistrée (migration 20261204000000_corrections_ecoute.sql appliquée ?)." };
  revalidatePath("/admin/voix");
  return { ok: true, message: "C'est noté : Tamilya en tient compte à la prochaine conversation vocale." };
}

export async function removeCorrectionAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = z.strictObject({ id: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, message: "Correction invalide." };
  if (!(await removeVoiceCorrection(parsed.data.id))) return { ok: false, message: "Correction non retirée, réessaie." };
  revalidatePath("/admin/voix");
  return { ok: true, message: "Correction retirée." };
}

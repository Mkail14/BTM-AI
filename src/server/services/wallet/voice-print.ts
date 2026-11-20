import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isValidPrint, judgeVoice, type VoiceSample, type VoiceVerdict } from "@/lib/voice-live/voice-check";

/**
 * Empreinte de voix du titulaire (table voice_prints) : deuxième vérification
 * du paiement à la voix, avec le code. L'empreinte n'est jamais renvoyée au
 * navigateur ; le serveur seul compare.
 */

export const VOICE_MODEL = "wespeaker-resnet34-lm-int8";
export const VOICE_MAX_FAILURES = 5;
export const VOICE_LOCK_MS = 15 * 60_000;

type Row = { print: number[]; model: string; failed_checks: number; locked_until: string | null; created_at: string };

/** Table absente (migration pas encore appliquée) : la vérification de la voix est simplement inactive. */
const missingTable = (error: { code?: string } | null) => error?.code === "42P01" || error?.code === "PGRST205";

async function readRow(admin: SupabaseClient, userId: string): Promise<Row | null> {
  const { data, error } = await admin.from("voice_prints").select("print, model, failed_checks, locked_until, created_at").eq("user_id", userId).maybeSingle();
  if (missingTable(error)) return null;
  if (error) throw error;
  return data as Row | null;
}

export async function voiceStatus(admin: SupabaseClient, userId: string): Promise<{ enrolled: boolean; since: string | null }> {
  const row = await readRow(admin, userId);
  return { enrolled: Boolean(row && row.model === VOICE_MODEL), since: row?.created_at ?? null };
}

export async function saveVoicePrint(admin: SupabaseClient, userId: string, print: number[]): Promise<void> {
  if (!isValidPrint(print)) throw new Error("empreinte invalide");
  const { error } = await admin.from("voice_prints").upsert({
    user_id: userId,
    print,
    model: VOICE_MODEL,
    consent_at: new Date().toISOString(),
    failed_checks: 0,
    locked_until: null,
    created_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export async function deleteVoicePrint(admin: SupabaseClient, userId: string): Promise<void> {
  const { error } = await admin.from("voice_prints").delete().eq("user_id", userId);
  if (error && !missingTable(error)) throw error;
}

type Refusal = Extract<VoiceVerdict, { ok: false }>["reason"];
export type VoiceGate = { ok: true; checked: boolean } | { ok: false; reason: Refusal | "missing" | "locked"; locked?: boolean };

/**
 * Avant le code : si le compte a une voix inscrite, la voix entendue doit être la sienne.
 * Pas de voix inscrite : rien à vérifier (checked: false).
 */
export async function checkVoice(admin: SupabaseClient, userId: string, sample: VoiceSample | undefined, now = Date.now()): Promise<VoiceGate> {
  const row = await readRow(admin, userId);
  if (!row || row.model !== VOICE_MODEL) return { ok: true, checked: false };
  if (row.locked_until && Date.parse(row.locked_until) > now) return { ok: false, reason: "locked" };
  if (!sample) return { ok: false, reason: "missing" };
  const verdict = judgeVoice(row.print, sample);
  if (verdict.ok) {
    if (row.failed_checks || row.locked_until) await admin.from("voice_prints").update({ failed_checks: 0, locked_until: null }).eq("user_id", userId);
    return { ok: true, checked: true };
  }
  // « Pas assez entendu » n'est pas une erreur de la personne : seul un refus compte.
  if (verdict.reason !== "mismatch") return { ok: false, reason: verdict.reason };
  const failures = (row.locked_until ? 0 : row.failed_checks) + 1;
  const locked = failures >= VOICE_MAX_FAILURES ? new Date(now + VOICE_LOCK_MS).toISOString() : null;
  await admin.from("voice_prints").update({ failed_checks: locked ? 0 : failures, locked_until: locked }).eq("user_id", userId);
  return { ok: false, reason: "mismatch", locked: Boolean(locked) };
}

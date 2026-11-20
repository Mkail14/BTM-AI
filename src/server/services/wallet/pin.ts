import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Code de paiement à 4 chiffres : obligatoire pour que Tamilya paie à la voix
 * (table wallet_pins). Seule une empreinte est gardée ; le code n'est jamais
 * enregistré, ni écrit dans un journal.
 */

export const PIN_MAX_FAILURES = 5;
export const PIN_LOCK_MS = 15 * 60_000;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
/** Essais pour gagner la course quand plusieurs codes arrivent en même temps. */
const PIN_WRITE_TRIES = 3;

/**
 * Blocage progressif : le compteur ne revient à zéro qu'après un code juste.
 * 5 erreurs : 15 min ; 10 erreurs : 1 h ; 15 erreurs, puis toutes les 5 erreurs : 24 h.
 * Jamais un blocage à chaque erreur : quelqu'un qui a oublié son code garde 5 essais par jour
 * (deviner un code sur 10 000 prendrait alors des années), au lieu d'être bloqué sans fin.
 */
export function pinLockMs(failures: number): number | null {
  if (failures % PIN_MAX_FAILURES !== 0) return null;
  if (failures >= 3 * PIN_MAX_FAILURES) return DAY_MS;
  if (failures === 2 * PIN_MAX_FAILURES) return HOUR_MS;
  if (failures === PIN_MAX_FAILURES) return PIN_LOCK_MS;
  return null;
}

/** Codes faux restants avant le prochain blocage. */
export function pinTriesLeft(failures: number): number {
  return PIN_MAX_FAILURES - (failures % PIN_MAX_FAILURES);
}

/** Durée restante d'un blocage, en mots (« 15 minutes », « 1 heure », « 24 heures »). */
export function describePinWait(lockedUntil: string | undefined, now = Date.now()): string {
  const ms = lockedUntil ? Date.parse(lockedUntil) - now : PIN_LOCK_MS;
  const minutes = Math.max(1, Math.ceil((Number.isFinite(ms) ? ms : PIN_LOCK_MS) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? "s" : ""}`;
  const hours = Math.ceil(minutes / 60);
  return `${hours} heure${hours > 1 ? "s" : ""}`;
}

/** Codes trop faciles à deviner (même chiffre, suites) : refusés. */
export function isAcceptablePin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) return false;
  if (/^(\d)\1{3}$/.test(pin)) return false;
  return !"0123456789".includes(pin) && !"9876543210".includes(pin);
}

export function hashPin(pin: string, salt: string): string {
  return scryptSync(`${pin}`, salt, 32).toString("base64url");
}

const sameHash = (a: string, b: string) => {
  const [x, y] = [Buffer.from(a), Buffer.from(b)];
  return x.length === y.length && timingSafeEqual(x, y);
};

type Row = { pin_hash: string; salt: string; failed_attempts: number; locked_until: string | null };

async function readRow(admin: SupabaseClient, userId: string): Promise<Row | null> {
  const { data, error } = await admin.from("wallet_pins").select("pin_hash, salt, failed_attempts, locked_until").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as Row | null;
}

export async function hasPin(admin: SupabaseClient, userId: string): Promise<boolean> {
  return Boolean(await readRow(admin, userId));
}

/** Le compte a-t-il un code, et a-t-il déjà autorisé Tamilya à payer (une seule fois) ? */
export async function payStatus(admin: SupabaseClient, userId: string): Promise<{ hasPin: boolean; consented: boolean }> {
  const { data, error } = await admin.from("wallet_pins").select("voice_pay_consent_at").eq("user_id", userId).maybeSingle();
  // Migration pas encore appliquée : on garde l'ancien fonctionnement (avertissement à chaque fois).
  if (error?.code === "42703") return { hasPin: await hasPin(admin, userId), consented: false };
  if (error) throw error;
  return { hasPin: Boolean(data), consented: Boolean(data?.voice_pay_consent_at) };
}

/** Enregistre (ou retire) l'autorisation donnée une fois pour toutes. Exige un code. */
export async function setConsent(admin: SupabaseClient, userId: string, given: boolean): Promise<PinCheck> {
  if (!(await hasPin(admin, userId))) return { ok: false, reason: "none" };
  const { error } = await admin
    .from("wallet_pins")
    .update({ voice_pay_consent_at: given ? new Date().toISOString() : null })
    .eq("user_id", userId);
  if (error) throw error;
  return { ok: true };
}

export type PinCheck = { ok: true } | { ok: false; reason: "none" | "wrong" | "locked"; left?: number; lockedUntil?: string };

/**
 * Vérifie le code ; compte les erreurs et bloque de plus en plus longtemps (pinLockMs).
 *
 * Chaque essai est d'abord compté comme raté, par une écriture conditionnelle
 * (« seulement si le compteur vaut encore n ») : des essais envoyés en même
 * temps ne peuvent pas tous lire le même compteur et s'en tirer avec une seule
 * erreur. Le code n'est comparé qu'une fois l'essai compté ; s'il est juste, le
 * compteur repart de zéro. Un essai qui perd la course plusieurs fois est refusé
 * sans être comparé.
 */
export async function verifyPin(admin: SupabaseClient, userId: string, pin: string, now = Date.now()): Promise<PinCheck> {
  let failures = 0;
  for (let attempt = 0; attempt < PIN_WRITE_TRIES; attempt++) {
    const row = await readRow(admin, userId);
    if (!row) return { ok: false, reason: "none" };
    if (row.locked_until && Date.parse(row.locked_until) > now) return { ok: false, reason: "locked", lockedUntil: row.locked_until };
    const counted = row.failed_attempts ?? 0;
    failures = counted + 1;
    const lockMs = pinLockMs(failures);
    const locked = lockMs ? new Date(now + lockMs).toISOString() : null;
    const { data, error } = await admin
      .from("wallet_pins")
      .update({ failed_attempts: failures, locked_until: locked })
      .eq("user_id", userId)
      .eq("failed_attempts", counted)
      .select("user_id");
    if (error) throw error;
    // Un autre essai a écrit entre-temps : on relit et on recommence.
    if (!data?.length) continue;
    if (/^\d{4}$/.test(pin) && sameHash(hashPin(pin, row.salt), row.pin_hash)) {
      const { error: resetError } = await admin.from("wallet_pins").update({ failed_attempts: 0, locked_until: null }).eq("user_id", userId);
      if (resetError) throw resetError;
      return { ok: true };
    }
    return locked ? { ok: false, reason: "locked", lockedUntil: locked } : { ok: false, reason: "wrong", left: pinTriesLeft(failures) };
  }
  // Trop d'essais simultanés : celui-ci est refusé comme raté, sans comparer le code.
  return { ok: false, reason: "wrong", left: Math.max(1, pinTriesLeft(failures) - 1) };
}

/** Crée ou change le code. S'il existe déjà, l'ancien est exigé. */
export async function savePin(admin: SupabaseClient, userId: string, pin: string, current?: string): Promise<PinCheck | { ok: false; reason: "weak" }> {
  if (!isAcceptablePin(pin)) return { ok: false, reason: "weak" };
  if (await hasPin(admin, userId)) {
    const check = await verifyPin(admin, userId, current ?? "");
    if (!check.ok) return check;
  }
  const salt = randomBytes(16).toString("base64url");
  const { error } = await admin
    .from("wallet_pins")
    .upsert({ user_id: userId, pin_hash: hashPin(pin, salt), salt, failed_attempts: 0, locked_until: null, updated_at: new Date().toISOString() });
  if (error) throw error;
  return { ok: true };
}

/** Supprime le code (l'actuel est exigé) : Tamilya ne peut plus payer à la voix. */
export async function removePin(admin: SupabaseClient, userId: string, current: string): Promise<PinCheck> {
  const check = await verifyPin(admin, userId, current);
  if (!check.ok) return check;
  const { error } = await admin.from("wallet_pins").delete().eq("user_id", userId);
  if (error) throw error;
  return { ok: true };
}

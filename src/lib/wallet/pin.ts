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

export type PinCheck = { ok: true } | { ok: false; reason: "none" | "wrong" | "locked"; left?: number; lockedUntil?: string };

/** Vérifie le code ; compte les erreurs et bloque après PIN_MAX_FAILURES. */
export async function verifyPin(admin: SupabaseClient, userId: string, pin: string, now = Date.now()): Promise<PinCheck> {
  const row = await readRow(admin, userId);
  if (!row) return { ok: false, reason: "none" };
  if (row.locked_until && Date.parse(row.locked_until) > now) return { ok: false, reason: "locked", lockedUntil: row.locked_until };
  if (/^\d{4}$/.test(pin) && sameHash(hashPin(pin, row.salt), row.pin_hash)) {
    if (row.failed_attempts || row.locked_until) await admin.from("wallet_pins").update({ failed_attempts: 0, locked_until: null }).eq("user_id", userId);
    return { ok: true };
  }
  // Après un blocage écoulé, on repart de zéro.
  const failures = (row.locked_until ? 0 : row.failed_attempts) + 1;
  const locked = failures >= PIN_MAX_FAILURES ? new Date(now + PIN_LOCK_MS).toISOString() : null;
  await admin
    .from("wallet_pins")
    .update({ failed_attempts: locked ? 0 : failures, locked_until: locked })
    .eq("user_id", userId);
  return locked ? { ok: false, reason: "locked", lockedUntil: locked } : { ok: false, reason: "wrong", left: PIN_MAX_FAILURES - failures };
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

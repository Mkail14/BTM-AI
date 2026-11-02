import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

/**
 * Déverrouillage du Profil de l'entreprise, comme les réglages sensibles d'un
 * compte Google : le mot de passe est redemandé, puis les modifications sont
 * permises quelques minutes. Preuve gardée dans un cookie httpOnly signé
 * (HMAC), lié au compte et à son heure de fin : impossible à fabriquer ou à
 * prolonger depuis le navigateur.
 */

export const UNLOCK_MINUTES = 10;
const COOKIE = "btm_profile_unlock";
const PATH = "/admin/profil";

function secret(): string | null {
  return process.env.AI_KEYS_SECRET?.trim() || process.env.SUPABASE_SECRET_KEY?.trim() || null;
}

const sign = (key: string, userId: string, until: number) => createHmac("sha256", key).update(`profile-unlock.${userId}.${until}`).digest("base64url");

/** Fin du déverrouillage (millisecondes), ou null si la page est verrouillée. */
export async function unlockedUntil(userId: string): Promise<number | null> {
  const key = secret();
  const value = (await cookies()).get(COOKIE)?.value;
  if (!key || !value) return null;
  const [untilText, signature] = value.split(".");
  const until = Number(untilText);
  if (!Number.isSafeInteger(until) || until <= Date.now() || !signature) return null;
  const expected = Buffer.from(sign(key, userId, until));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? until : null;
}

export async function unlock(userId: string): Promise<number | null> {
  const key = secret();
  if (!key) return null;
  const until = Date.now() + UNLOCK_MINUTES * 60_000;
  (await cookies()).set(COOKIE, `${until}.${sign(key, userId, until)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: PATH,
    maxAge: UNLOCK_MINUTES * 60,
  });
  return until;
}

export async function lock() {
  (await cookies()).delete({ name: COOKIE, path: PATH });
}

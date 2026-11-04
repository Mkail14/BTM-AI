import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Cookies signés (HMAC) : le contenu reste lisible, mais le navigateur ne peut
 * ni le fabriquer ni le modifier (solde fictif, dernière commande…). Un cookie
 * à la signature fausse est ignoré, comme s'il n'existait pas.
 * Même secret que le déverrouillage du Profil (src/lib/admin/unlock.ts).
 */

function secret(): string | null {
  const key = process.env.AI_KEYS_SECRET?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (key) return key;
  // Poste de développement sans clé : un secret fixe, pour que la démo marche quand même.
  return process.env.NODE_ENV === "production" ? null : "btm-dev-cookie-secret";
}

const mac = (key: string, purpose: string, payload: string) =>
  createHmac("sha256", key).update(`${purpose}.${payload}`).digest("base64url");

/** « contenu.signature », ou null sans secret (rien n'est alors gardé). */
export function signJson(purpose: string, value: unknown, key = secret()): string | null {
  if (!key) return null;
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${mac(key, purpose, payload)}`;
}

/** Contenu d'un cookie signé, ou null (absent, abîmé, signature fausse ou sans secret). */
export function verifyJson<T>(purpose: string, raw: string | undefined, key = secret()): T | null {
  if (!key || !raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const expected = Buffer.from(mac(key, purpose, payload));
  const given = Buffer.from(raw.slice(dot + 1));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

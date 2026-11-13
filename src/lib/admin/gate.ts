import "server-only";
import { cookies } from "next/headers";
import { safeNextPath } from "@/lib/auth/redirect";
import { signJson, verifyJson } from "@/lib/security/signed-cookie";

/**
 * Verrou de l'espace d'administration : pour entrer, le code à 6 chiffres de
 * l'application d'authentification (Google Authenticator…), vérifié par
 * Supabase Auth (MFA TOTP). La preuve est gardée dans un cookie httpOnly signé
 * (HMAC), lié au compte et à l'heure de la dernière utilisation : chaque page
 * ou action la prolonge, et après 15 minutes sans rien, le verrou se referme.
 */

export const ADMIN_IDLE_MINUTES = 15;
export const ADMIN_GATE_COOKIE = "btm_admin_gate";
export const ADMIN_LOCK_PATH = "/admin/verrou";

const PURPOSE = "admin-gate";
const IDLE_MS = ADMIN_IDLE_MINUTES * 60_000;

type Gate = { u: string; seen: number };

export const adminGateCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
  maxAge: ADMIN_IDLE_MINUTES * 60,
} as const;

/** Pages gardées par le verrou : tout /admin, sauf la page du code elle-même. */
export function isAdminGatedPath(pathname: string): boolean {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return false;
  return pathname !== ADMIN_LOCK_PATH && !pathname.startsWith(`${ADMIN_LOCK_PATH}/`);
}

/** Page du code, qui ramène ensuite à la page demandée. */
export function adminLockPath(next: string): string {
  const target = safeNextPath(next, "/admin");
  return `${ADMIN_LOCK_PATH}?suite=${encodeURIComponent(isAdminGatedPath(target.split("?")[0]) ? target : "/admin")}`;
}

/** Valeur du cookie : utilisé maintenant par ce compte (null sans secret). */
export function adminGateValue(userId: string, now = Date.now()): string | null {
  return signJson(PURPOSE, { u: userId, seen: now } satisfies Gate);
}

/** Cookie signé, du bon compte, utilisé il y a moins de 15 minutes. */
export function isAdminGateOpen(raw: string | undefined, userId: string, now = Date.now()): boolean {
  const gate = verifyJson<Gate>(PURPOSE, raw);
  if (!gate || gate.u !== userId || !Number.isSafeInteger(gate.seen)) return false;
  return gate.seen <= now + 60_000 && now - gate.seen < IDLE_MS;
}

export async function adminGateOpen(userId: string): Promise<boolean> {
  return isAdminGateOpen((await cookies()).get(ADMIN_GATE_COOKIE)?.value, userId);
}

/** Ouvre (après un code juste) ou prolonge (à chaque action) le verrou. */
export async function openAdminGate(userId: string): Promise<boolean> {
  const value = adminGateValue(userId);
  if (!value) return false;
  (await cookies()).set(ADMIN_GATE_COOKIE, value, adminGateCookieOptions);
  return true;
}

export async function closeAdminGate() {
  (await cookies()).delete({ name: ADMIN_GATE_COOKIE, path: "/" });
}

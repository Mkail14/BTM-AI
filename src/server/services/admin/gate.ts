import "server-only";
import { cookies } from "next/headers";
import { safeNextPath } from "@/lib/auth/redirect";
import { signJson, verifyJson } from "@/server/services/security/signed-cookie";
import { ADMIN_IDLE_CHOICES } from "@/lib/admin/idle";

/**
 * Verrou de l'espace d'administration : pour entrer, le code à 6 chiffres de
 * l'application d'authentification (Google Authenticator…), vérifié par
 * Supabase Auth (MFA TOTP). La preuve est gardée dans un cookie httpOnly signé
 * (HMAC), lié au compte, à l'heure de la dernière utilisation et au délai
 * choisi : chaque page ou action la prolonge, et après ce délai sans rien, le
 * verrou se referme. Délai réglable dans Mon compte, Sécurité (0 = jamais).
 */

/** Délai par défaut, en minutes. */
export const ADMIN_IDLE_MINUTES = 15;

export { ADMIN_IDLE_CHOICES };
export const ADMIN_GATE_COOKIE = "btm_admin_gate";
export const ADMIN_LOCK_PATH = "/admin/verrou";

/** Réglages du compte dans app_metadata (seul le serveur peut les écrire). */
export const ADMIN_IDLE_KEY = "admin_gate_idle";
/** L'administrateur a retiré son application : l'admin s'ouvre sans code. */
export const ADMIN_CODE_OFF_KEY = "admin_code_off";

const PURPOSE = "admin-gate";
/** « Jamais » : le navigateur garde le cookie le plus longtemps possible (400 jours). */
const NEVER_MAX_AGE = 400 * 24 * 60 * 60;

type Gate = { u: string; seen: number; idle?: number };

export function isIdleChoice(value: unknown): value is number {
  return typeof value === "number" && (ADMIN_IDLE_CHOICES as readonly number[]).includes(value);
}

/** Délai choisi par le compte (app_metadata), 15 minutes sinon. */
export function idleFromMetadata(meta: Record<string, unknown> | null | undefined): number {
  const value = meta?.[ADMIN_IDLE_KEY];
  return isIdleChoice(value) ? value : ADMIN_IDLE_MINUTES;
}

export function codeOffFromMetadata(meta: Record<string, unknown> | null | undefined): boolean {
  return meta?.[ADMIN_CODE_OFF_KEY] === true;
}

export function adminGateCookieOptions(idle: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: idle > 0 ? idle * 60 : NEVER_MAX_AGE,
  } as const;
}

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

/** Valeur du cookie : utilisé maintenant par ce compte, avec ce délai (null sans secret). */
export function adminGateValue(userId: string, now = Date.now(), idle = ADMIN_IDLE_MINUTES): string | null {
  return signJson(PURPOSE, { u: userId, seen: now, idle } satisfies Gate);
}

/**
 * Délai du verrou ouvert (0 = jamais), ou null s'il est fermé : cookie absent,
 * modifié, d'un autre compte, ou pas utilisé depuis plus que le délai.
 */
export function readAdminGate(raw: string | undefined, userId: string, now = Date.now()): number | null {
  const gate = verifyJson<Gate>(PURPOSE, raw);
  if (!gate || gate.u !== userId || !Number.isSafeInteger(gate.seen)) return null;
  // Ancien cookie, sans délai : 15 minutes, comme avant.
  const idle = gate.idle === undefined ? ADMIN_IDLE_MINUTES : gate.idle;
  if (!isIdleChoice(idle) || gate.seen > now + 60_000) return null;
  if (idle > 0 && now - gate.seen >= idle * 60_000) return null;
  return idle;
}

export function isAdminGateOpen(raw: string | undefined, userId: string, now = Date.now()): boolean {
  return readAdminGate(raw, userId, now) !== null;
}

/** Délai du verrou ouvert de ce compte, ou null s'il est fermé. */
export async function adminGateIdle(userId: string): Promise<number | null> {
  return readAdminGate((await cookies()).get(ADMIN_GATE_COOKIE)?.value, userId);
}

export async function adminGateOpen(userId: string): Promise<boolean> {
  return (await adminGateIdle(userId)) !== null;
}

/**
 * Ouvre (après un code juste, avec le délai du compte) ou prolonge (à chaque
 * action : sans `idle`, le délai du cookie en place est gardé).
 */
export async function openAdminGate(userId: string, idle?: number): Promise<boolean> {
  const jar = await cookies();
  const keep = idle ?? readAdminGate(jar.get(ADMIN_GATE_COOKIE)?.value, userId) ?? ADMIN_IDLE_MINUTES;
  const value = adminGateValue(userId, Date.now(), keep);
  if (!value) return false;
  jar.set(ADMIN_GATE_COOKIE, value, adminGateCookieOptions(keep));
  return true;
}

export async function closeAdminGate() {
  (await cookies()).delete({ name: ADMIN_GATE_COOKIE, path: "/" });
}

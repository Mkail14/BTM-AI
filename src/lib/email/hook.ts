import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vérification de la signature des appels de Supabase (« Send Email Hook »,
 * format Standard Webhooks) : HMAC-SHA256 de « id.horodatage.corps » avec le
 * secret « v1,whsec_<base64> » affiché par Supabase.
 */
const TOLERANCE_SECONDS = 5 * 60;

export function verifyHookSignature(
  secret: string,
  body: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  now = Date.now(),
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(now / 1000 - seconds) > TOLERANCE_SECONDS) return false;

  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();

  // Plusieurs signatures possibles (rotation du secret) : « v1,abc v1,def ».
  return signature.split(" ").some((part) => {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) return false;
    const given = Buffer.from(value, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

export type HookPayload = {
  user: { id: string; email: string; new_email?: string; user_metadata?: Record<string, unknown> };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
};

/** Lien de vérification de Supabase : il valide le jeton puis renvoie vers redirect_to. */
export function verifyLink(supabaseUrl: string, tokenHash: string, type: string, redirectTo: string) {
  const url = new URL(`${supabaseUrl.replace(/\/+$/, "")}/auth/v1/verify`);
  url.searchParams.set("token", tokenHash);
  url.searchParams.set("type", type);
  if (redirectTo) url.searchParams.set("redirect_to", redirectTo);
  return url.toString();
}

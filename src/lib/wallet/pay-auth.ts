import "server-only";
import { cookies } from "next/headers";
import { signJson, verifyJson } from "@/lib/security/signed-cookie";

/**
 * Preuve que le code de paiement vient d'être tapé juste, gardée dans un cookie
 * signé (le navigateur ne peut ni le fabriquer ni le prolonger). Sans elle, aucune
 * route ne débite le portefeuille : appeler l'API directement ne suffit pas.
 *
 * - « once » : paiement au doigt. Vaut pour UN seul paiement, puis s'efface.
 * - « window » : paiement à la voix. Tamilya peut payer plusieurs parties d'un
 *   tableau combiné pendant 2 minutes.
 */

const COOKIE = "btm_pay_ok";
const PURPOSE = "pay-ok";
export const PAY_AUTH_MS = 2 * 60_000;

export type PayScope = "once" | "window";
type Grant = { u: string; exp: number; scope: PayScope };

export async function grantPayment(userId: string, scope: PayScope, now = Date.now()): Promise<void> {
  const value = signJson(PURPOSE, { u: userId, exp: now + PAY_AUTH_MS, scope } satisfies Grant);
  if (!value) return;
  (await cookies()).set(COOKIE, value, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PAY_AUTH_MS / 1000,
  });
}

/** Le code a-t-il été tapé juste juste avant ? Un accord « once » est consommé ici. */
export async function takePaymentGrant(userId: string, now = Date.now()): Promise<boolean> {
  const jar = await cookies();
  const grant = verifyJson<Grant>(PURPOSE, jar.get(COOKIE)?.value);
  if (!grant || grant.u !== userId || grant.exp <= now) return false;
  if (grant.scope === "once") jar.delete(COOKIE);
  return true;
}

/** Réponse des routes de paiement quand le code manque : l'écran le redemande. */
export const PIN_REQUIRED = { error: "Tape ton code de paiement pour confirmer.", reason: "pin" } as const;

import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { PRINT_SIZE } from "@/lib/voice-live/voice-check";
import { describePinWait, hasPin, verifyPin } from "@/lib/wallet/pin";
import { deleteVoicePrint, saveVoicePrint, voiceStatus } from "@/lib/wallet/voice-print";

/**
 * Empreinte de voix du titulaire (double vérification du paiement à la voix).
 * GET : une voix est-elle inscrite ? POST : l'inscrire (accord exigé). DELETE : l'effacer.
 * L'empreinte n'est jamais renvoyée.
 *
 * Si le compte a un code de paiement, inscrire ou effacer la voix exige ce code
 * (current) : sinon, quelqu'un qui tient le téléphone déverrouillé pourrait
 * mettre sa propre voix à la place. Un code faux compte comme une erreur de code.
 */

const pin = z.string().regex(/^\d{4}$/);
const bodySchema = z.object({
  print: z.array(z.number().finite()).length(PRINT_SIZE),
  consent: z.literal(true),
  current: pin.optional(),
});
const deleteSchema = z.object({ current: pin.optional() });

const headers = { "Cache-Control": "no-store" };
const fail = (status: number, error: string, extra: object = {}) => NextResponse.json({ ok: false, error, ...extra }, { status, headers });

async function context() {
  const { user } = await getAuthContext();
  const admin = getSupabaseAdminClient();
  return user && admin ? { user, admin } : null;
}

/** Limite d'essais, puis code de paiement actuel s'il existe. Renvoie la réponse de refus, ou null. */
async function guard(admin: SupabaseClient, userId: string, current: string | undefined): Promise<NextResponse | null> {
  const limit = await consumeRateLimits([{ key: `voice-print:${userId}`, rules: RATE_LIMIT_POLICIES.walletPin }]).catch(() => null);
  if (!limit) return fail(503, "Service momentanément indisponible : réessaie dans un instant.");
  if (!limit.allowed) return fail(429, "Trop d'essais : réessaie dans un moment.");
  if (!(await hasPin(admin, userId))) return null;
  if (!current) return fail(403, "Tape ton code de paiement pour confirmer.", { reason: "pin-required" });
  const check = await verifyPin(admin, userId, current);
  if (check.ok || check.reason === "none") return null;
  if (check.reason === "locked") return fail(423, `Trop de codes faux : réessaie dans ${describePinWait(check.lockedUntil)}.`, { reason: "locked" });
  return fail(403, `Code faux. ${check.left} essai${(check.left ?? 0) > 1 ? "s" : ""} avant blocage.`, { reason: "wrong", left: check.left });
}

export async function GET() {
  const ctx = await context();
  if (!ctx) return fail(401, "Connexion requise.");
  const [status, pinSet] = await Promise.all([voiceStatus(ctx.admin, ctx.user.id), hasPin(ctx.admin, ctx.user.id)]);
  return NextResponse.json({ ...status, hasPin: pinSet }, { headers });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const ctx = await context();
  if (!ctx) return fail(401, "Connexion requise.");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Empreinte de voix illisible : recommence l'enregistrement.");
  try {
    const refused = await guard(ctx.admin, ctx.user.id, parsed.data.current);
    if (refused) return refused;
    await saveVoicePrint(ctx.admin, ctx.user.id, parsed.data.print);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("[empreinte de voix] Erreur", error instanceof Error ? error.message : "inconnue");
    return fail(500, "Ta voix n'a pas pu être enregistrée. Réessaie.");
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const ctx = await context();
  if (!ctx) return fail(401, "Connexion requise.");
  // Corps facultatif : un compte sans code peut effacer sa voix sans rien envoyer.
  const parsed = deleteSchema.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) return fail(400, "Le code fait 4 chiffres.");
  try {
    const refused = await guard(ctx.admin, ctx.user.id, parsed.data.current);
    if (refused) return refused;
    await deleteVoicePrint(ctx.admin, ctx.user.id);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("[empreinte de voix] Erreur", error instanceof Error ? error.message : "inconnue");
    return fail(500, "Ta voix n'a pas pu être effacée. Réessaie.");
  }
}

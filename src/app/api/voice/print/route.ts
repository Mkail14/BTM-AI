import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { PRINT_SIZE } from "@/lib/voice-live/voice-check";
import { deleteVoicePrint, saveVoicePrint, voiceStatus } from "@/lib/wallet/voice-print";

/**
 * Empreinte de voix du titulaire (double vérification du paiement à la voix).
 * GET : une voix est-elle inscrite ? POST : l'inscrire (accord exigé). DELETE : l'effacer.
 * L'empreinte n'est jamais renvoyée.
 */

const bodySchema = z.object({
  print: z.array(z.number().finite()).length(PRINT_SIZE),
  consent: z.literal(true),
});

const headers = { "Cache-Control": "no-store" };
const fail = (status: number, error: string) => NextResponse.json({ ok: false, error }, { status, headers });

async function context() {
  const { user } = await getAuthContext();
  const admin = getSupabaseAdminClient();
  return user && admin ? { user, admin } : null;
}

export async function GET() {
  const ctx = await context();
  if (!ctx) return fail(401, "Connexion requise.");
  return NextResponse.json(await voiceStatus(ctx.admin, ctx.user.id), { headers });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const ctx = await context();
  if (!ctx) return fail(401, "Connexion requise.");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Empreinte de voix illisible : recommence l'enregistrement.");
  const limit = await consumeRateLimits([{ key: `voice-print:${ctx.user.id}`, rules: RATE_LIMIT_POLICIES.walletPin }]).catch(() => null);
  if (!limit) return fail(503, "Service momentanément indisponible : réessaie dans un instant.");
  if (!limit.allowed) return fail(429, "Trop d'essais : réessaie dans un moment.");
  try {
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
  try {
    await deleteVoicePrint(ctx.admin, ctx.user.id);
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    console.error("[empreinte de voix] Erreur", error instanceof Error ? error.message : "inconnue");
    return fail(500, "Ta voix n'a pas pu être effacée. Réessaie.");
  }
}

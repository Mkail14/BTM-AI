import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { payStatus, removePin, savePin, setConsent, verifyPin, type PinCheck } from "@/lib/wallet/pin";

/**
 * Code de paiement à 4 chiffres (paiement à la voix par Tamilya).
 * GET : le compte a-t-il un code ? POST : créer, changer, supprimer ou vérifier.
 * Le code n'est jamais renvoyé, ni écrit dans un journal.
 */

const pin = z.string().regex(/^\d{4}$/);
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), pin }),
  z.object({ action: z.literal("set"), pin, current: pin.optional() }),
  z.object({ action: z.literal("remove"), current: pin }),
  // Autorisation donnée une seule fois (consent) ou retirée (revoke).
  z.object({ action: z.literal("consent") }),
  z.object({ action: z.literal("revoke") }),
]);

const fail = (status: number, error: string, extra: object = {}) => NextResponse.json({ ok: false, error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

function explain(check: Exclude<PinCheck, { ok: true }> | { ok: false; reason: "weak" }) {
  if (check.reason === "none") return fail(404, "Aucun code de paiement : crée-le dans les paramètres, rubrique Tamilya.", { reason: "none" });
  if (check.reason === "weak") return fail(400, "Code trop facile (même chiffre ou suite) : choisis-en un autre.", { reason: "weak" });
  if (check.reason === "locked") return fail(423, "Trop de codes faux : réessaie dans 15 minutes.", { reason: "locked" });
  return fail(403, `Code faux. ${check.left} essai${(check.left ?? 0) > 1 ? "s" : ""} avant blocage.`, { reason: "wrong", left: check.left });
}

export async function GET() {
  const { user } = await getAuthContext();
  const admin = getSupabaseAdminClient();
  if (!user || !admin) return fail(401, "Connexion requise.");
  return NextResponse.json(await payStatus(admin, user.id), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const { user } = await getAuthContext();
  const admin = getSupabaseAdminClient();
  if (!user || !admin) return fail(401, "Connexion requise.");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Le code fait 4 chiffres.");

  const limit = await consumeRateLimits([{ key: `wallet-pin:${user.id}`, rules: RATE_LIMIT_POLICIES.walletPin }]).catch(() => null);
  if (!limit) return fail(503, "Service momentanément indisponible : réessaie dans un instant.");
  if (!limit.allowed) return fail(429, "Trop d'essais : réessaie dans un moment.");

  try {
    const body = parsed.data;
    const check =
      body.action === "verify"
        ? await verifyPin(admin, user.id, body.pin)
        : body.action === "set"
          ? await savePin(admin, user.id, body.pin, body.current)
          : body.action === "remove"
            ? await removePin(admin, user.id, body.current)
            : await setConsent(admin, user.id, body.action === "consent");
    if (!check.ok) return explain(check);
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[code de paiement] Erreur", error instanceof Error ? error.message : "inconnue");
    return fail(500, "Le code n'a pas pu être vérifié. Réessaie.");
  }
}

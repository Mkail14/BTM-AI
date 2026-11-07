import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { payStatus, removePin, savePin, setConsent, verifyPin, type PinCheck } from "@/lib/wallet/pin";
import { getProfile } from "@/lib/conversations/repository";
import { PRINT_SIZE } from "@/lib/voice-live/voice-check";
import { checkVoice, voiceStatus, type VoiceGate } from "@/lib/wallet/voice-print";

/**
 * Code de paiement à 4 chiffres (paiement à la voix par Tamilya).
 * GET : le compte a-t-il un code ? POST : créer, changer, supprimer ou vérifier.
 * Le code n'est jamais renvoyé, ni écrit dans un journal.
 *
 * Double vérification : si le compte a une voix inscrite, « verify » exige aussi
 * les empreintes des phrases entendues (voice). La voix est jugée AVANT le code :
 * une autre personne ne peut pas essayer des codes.
 */

const pin = z.string().regex(/^\d{4}$/);
const voice = z.object({
  parts: z.array(z.object({ print: z.array(z.number().finite()).length(PRINT_SIZE), seconds: z.number().min(0).max(30) })).max(12),
});
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("verify"), pin, voice: voice.optional() }),
  z.object({ action: z.literal("set"), pin, current: pin.optional() }),
  z.object({ action: z.literal("remove"), current: pin }),
  // Autorisation donnée une seule fois (consent) ou retirée (revoke).
  z.object({ action: z.literal("consent") }),
  z.object({ action: z.literal("revoke") }),
]);

const fail = (status: number, error: string, extra: object = {}) => NextResponse.json({ ok: false, error, ...extra }, { status, headers: { "Cache-Control": "no-store" } });

function refuseVoice(gate: Extract<VoiceGate, { ok: false }>, name: string) {
  const who = name || "la personne du compte";
  const messages: Record<typeof gate.reason, string> = {
    short: "Pas assez entendu sa voix pour la reconnaître.",
    unsure: "Voix pas assez claire pour être sûre que c'est bien elle.",
    missing: "Sa voix n'a pas pu être vérifiée sur cet appareil.",
    mismatch: gate.locked ? `Ce n'est pas la voix de ${who} : paiement à la voix bloqué 15 minutes.` : `Ce n'est pas la voix de ${who}.`,
    locked: "Trop de voix refusées : paiement à la voix bloqué 15 minutes.",
  };
  return fail(403, messages[gate.reason], { reason: `voice-${gate.reason}`, owner: name || null });
}

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
  const [status, voiceInfo] = await Promise.all([payStatus(admin, user.id), voiceStatus(admin, user.id)]);
  return NextResponse.json({ ...status, voice: voiceInfo.enrolled }, { headers: { "Cache-Control": "no-store" } });
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
    if (body.action === "verify") {
      const gate = await checkVoice(admin, user.id, body.voice);
      if (!gate.ok) return refuseVoice(gate, (await getProfile(admin, user.id).catch(() => null))?.displayName ?? "");
    }
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

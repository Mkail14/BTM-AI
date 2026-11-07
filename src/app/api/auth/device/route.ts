import { createHash, randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/lib/auth/session";
import { describeDevice, describePlace, siteOrigin } from "@/lib/email/device";
import { emailConfigured, sendEmail } from "@/lib/email/send";
import { newDeviceEmail } from "@/lib/email/templates";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Appelé par le navigateur juste après une connexion. Chaque navigateur porte
 * un identifiant aléatoire (cookie) ; s'il est inconnu pour ce compte et que le
 * compte a déjà un appareil connu, on prévient par e-mail. Le tout premier
 * appareil (inscription) est enregistré sans e-mail.
 */
const COOKIE = "btm_appareil";
const TWO_YEARS = 60 * 60 * 24 * 730;

export async function POST(request: NextRequest) {
  const { user } = await getAuthContext();
  if (!user?.email) return NextResponse.json({ ok: false }, { status: 401 });
  const admin = getSupabaseAdminClient();
  if (!admin) return NextResponse.json({ ok: false });

  const existing = request.cookies.get(COOKIE)?.value;
  const deviceId = existing && /^[0-9a-f-]{36}$/.test(existing) ? existing : randomUUID();
  const deviceHash = createHash("sha256").update(deviceId).digest("hex");
  const userAgent = request.headers.get("user-agent");
  const label = describeDevice(userAgent);

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, deviceId, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: TWO_YEARS });

  try {
    const { data: known, error } = await admin.from("known_devices").select("device_hash").eq("user_id", user.id);
    if (error) throw error;
    const isKnown = known.some((d) => d.device_hash === deviceHash);
    // Appareil inconnu (nouvelle ligne, et peut-être un e-mail) : limité par compte, pour
    // qu'une rafale d'appels sans cookie ne remplisse pas la table ni la boîte mail.
    if (!isKnown) {
      const limit = await consumeRateLimits([{ key: `auth-device:${user.id}`, rules: RATE_LIMIT_POLICIES.authDevice }]);
      if (!limit.allowed) return NextResponse.json({ ok: false, error: "Trop de nouveaux appareils, réessaie plus tard." }, { status: 429 });
    }

    await admin
      .from("known_devices")
      .upsert({ user_id: user.id, device_hash: deviceHash, label, last_seen: new Date().toISOString() }, { onConflict: "user_id,device_hash" });

    if (!isKnown && known.length > 0 && emailConfigured()) {
      const email = newDeviceEmail(user.email, {
        origin: siteOrigin(request.nextUrl.origin),
        device: label,
        place: describePlace(request.headers),
        at: new Date(),
      });
      await sendEmail(user.email, email);
    }
  } catch (error) {
    // Jamais bloquant pour la connexion elle-même.
    console.error("[device] Vérification de l'appareil impossible", error);
  }
  return response;
}

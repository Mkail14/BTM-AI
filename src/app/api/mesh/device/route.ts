import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { loadServerKey, readDevicePublicKey } from "@/lib/mesh/crypto";
import { registerDevice } from "@/lib/mesh/store";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Tamilya Connect : l'app (connectée, avec internet) enregistre la clé publique
 * de l'appareil. La clé privée reste dans le téléphone (Android Keystore).
 */

const bodySchema = z.strictObject({ publicKey: z.string().min(80).max(200) });
const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "forbidden");
  const { user } = await getAuthContext();
  if (!user) return fail(401, "signed_out");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !readDevicePublicKey(parsed.data.publicKey)) return fail(400, "invalid_key");

  const server = loadServerKey();
  const admin = getSupabaseAdminClient();
  if (!server || !admin) return fail(503, "unavailable");

  const limit = await consumeRateLimits([{ key: `mesh-register:${user.id}`, rules: RATE_LIMIT_POLICIES.meshRegister }]).catch(() => null);
  if (!limit?.allowed) return fail(429, "rate_limited");

  try {
    const device = await registerDevice(admin, user.id, parsed.data.publicKey);
    if (!device) return fail(409, "too_many_devices");
    return NextResponse.json({ deviceId: device.id, keyId: server.keyId, publicKey: server.publicKey }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[tamilya connect] Appareil non enregistré", error);
    return fail(500, "unavailable");
  }
}

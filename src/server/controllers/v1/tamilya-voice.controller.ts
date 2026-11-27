import { after, NextResponse, type NextRequest } from "next/server";
import { AIProviderError } from "@/server/services/ai";
import { speakAsTamilya, speechResponse } from "@/server/services/ai/voice/speak";
import { loadVoice } from "@/server/services/ai/voice/settings";
import { parseVoiceRequest, VOICE_MAX_BODY_BYTES } from "@/lib/developers/voice-request";
import { getDeveloperStatus } from "@/server/services/developers/accounts";
import { findDeveloperKey, hasVoiceAccess, touchDeveloperKey } from "@/server/services/developers/keys";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/server/middlewares/rate-limit";

/**
 * Voix de Tamilya pour l'API des développeurs (appel de serveur à serveur, sans CORS) :
 * { "text": "…" } → MP3 lu avec la voix du site (même moteur et même nettoyage que /api/voice/speak).
 * Réservée aux codes autorisés à la main par BTM (developer_keys.voice_enabled) ; quotas à part
 * des questions texte (RATE_LIMIT_POLICIES.developerVoice*). Ni le texte ni le code ne sont journalisés.
 */

const fail = (status: number, error: string, headers?: HeadersInit) =>
  NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store", ...headers } });

export async function POST(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  const developerKey = token ? await findDeveloperKey(token) : null;
  if (!developerKey) return fail(401, "invalid_access_code");
  const status = await getDeveloperStatus(developerKey.userId);
  if (status === "suspended") return fail(403, "account_suspended");
  if (status !== "approved") return fail(403, "terms_not_accepted");
  const voiceAccess = await hasVoiceAccess(developerKey.id);
  if (voiceAccess === null) return fail(503, "unavailable");
  if (!voiceAccess) return fail(403, "voice_not_allowed");
  after(() => touchDeveloperKey(developerKey.id));

  try {
    const limit = await consumeRateLimits([
      { key: `voice-key:${developerKey.id}`, rules: RATE_LIMIT_POLICIES.developerVoiceKey },
      { key: `voice-dev-account:${developerKey.userId}`, rules: RATE_LIMIT_POLICIES.developerVoiceAccount },
    ]);
    if (!limit.allowed) return fail(429, "rate_limited", { "Retry-After": String(limit.retryAfterSeconds) });
  } catch (error) {
    console.error("[api-dev-voix] Compteurs indisponibles", error);
    return fail(503, "unavailable");
  }

  // Corps trop lourd annoncé : refusé sans le lire.
  if (Number(request.headers.get("content-length")) > VOICE_MAX_BODY_BYTES) return fail(413, "invalid_request");
  const body = parseVoiceRequest(await request.text());
  if (!body.ok) return fail(body.status, "invalid_request");

  try {
    return speechResponse(await speakAsTamilya(body.text, await loadVoice(), request.signal));
  } catch (error) {
    const code = error instanceof AIProviderError ? error.code : "unavailable";
    if (code === "aborted") return fail(499, "aborted");
    // Jamais l'erreur brute ni le texte : seulement le code d'erreur et l'identifiant du code d'accès.
    console.error(`[api-dev-voix] Lecture impossible (${code}) pour le code ${developerKey.id}`);
    return fail(502, "provider_error");
  }
}

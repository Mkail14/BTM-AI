import { NextResponse, type NextRequest } from "next/server";
import { flowCutStop, loadFlowCuts } from "@/lib/ai/flow-cuts";
import { loadServerKey, openRequest, readDevicePublicKey, sealReply, verifySignature } from "@/lib/mesh/crypto";
import { isStale, MESH_MAX_BODY_BYTES, payloadSchema, requestEnvelopeSchema, type MeshReplyBody, type ReplyEnvelope } from "@/lib/mesh/envelope";
import { handleMeshPayload } from "@/lib/mesh/handle";
import { claimMessage, findDevice, releaseMessage, saveReply, touchDevice, type MeshDevice } from "@/lib/mesh/store";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { getClientIp, hashIdentifier } from "@/lib/security/request";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Tamilya Connect : un téléphone avec internet poste ici le message d'un autre
 * téléphone, arrivé de proche en proche. Pas de session : le message est signé
 * par l'appareil d'origine et chiffré pour le serveur. La réponse est chiffrée
 * pour lui seul ; le relais la renvoie par le même chemin.
 */
export const maxDuration = 60;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const ok = (envelope: ReplyEnvelope) => NextResponse.json(envelope, { headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (raw.length > MESH_MAX_BODY_BYTES) return fail(413, "too_large");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(400, "invalid_envelope");
  }
  const parsed = requestEnvelopeSchema.safeParse(json);
  if (!parsed.success) return fail(400, "invalid_envelope");
  const envelope = parsed.data;

  const server = loadServerKey();
  const admin = getSupabaseAdminClient();
  if (!server || !admin) return fail(503, "unavailable");
  // Clé du serveur changée depuis que l'app l'a gardée : elle doit la relire avec internet.
  if (envelope.keyId !== server.keyId) return fail(409, "key_changed");
  if (isStale(envelope.createdAt)) return fail(400, "stale");

  const relayLimit = await consumeRateLimits([
    { key: `mesh-relay:${hashIdentifier(`ip:${getClientIp(request.headers)}`)}`, rules: RATE_LIMIT_POLICIES.meshRelay },
  ]).catch(() => null);
  if (!relayLimit?.allowed) return fail(429, "rate_limited");

  let device: MeshDevice | null;
  try {
    device = await findDevice(admin, envelope.deviceId);
  } catch {
    // Panne passagère de la base : ce n'est pas la faute du message, le téléphone réessaie tout seul.
    return fail(503, "unavailable");
  }
  if (!device) {
    console.warn("[tamilya connect] Appareil inconnu ou révoqué");
    return fail(403, "unknown_device");
  }
  const deviceKey = readDevicePublicKey(device.publicKey);
  if (!deviceKey || !verifySignature(envelope, envelope.sig, deviceKey)) {
    console.warn("[tamilya connect] Signature refusée");
    return fail(403, "bad_signature");
  }

  const payload = payloadSchema.safeParse(openRequest(server, envelope));
  if (!payload.success) return fail(400, "invalid_payload");

  let claimed = false;
  try {
    const claim = await claimMessage(admin, envelope.id, device);
    // Même message arrivé par un autre chemin : même réponse, rien n'est refait.
    if (claim.state === "done") return ok(claim.reply);
    if (claim.state === "pending") return fail(409, "pending");
    if (claim.state === "foreign") return fail(409, "duplicate_id");
    claimed = true;

    // SOS : ni la pause de Tamilya ni la limite des messages ne le bloquent (il a sa propre limite).
    const sos = payload.data.kind === "sos";
    const deviceLimit = sos ? { allowed: true } : await consumeRateLimits([{ key: `mesh-device:${device.id}`, rules: RATE_LIMIT_POLICIES.meshDevice }]).catch(() => null);
    const body: MeshReplyBody = !deviceLimit?.allowed
      ? { status: "error", text: "Trop de messages d'un coup : réessaie dans un moment.", actions: [] }
      : !sos && flowCutStop(await loadFlowCuts())
        ? { status: "error", text: "Tamilya est en pause pour l'instant. Réessaie plus tard.", actions: [] }
        : await handleMeshPayload(admin, device.userId, payload.data);

    const sealed = sealReply(payload.data.replyKey, body);
    if (!sealed) {
      await releaseMessage(admin, envelope.id);
      return fail(400, "invalid_payload");
    }
    const reply: ReplyEnvelope = { v: 1, type: "reply", id: envelope.id, ...sealed };
    await saveReply(admin, envelope.id, reply);
    await touchDevice(admin, device.id).catch(() => {});
    return ok(reply);
  } catch (error) {
    console.error("[tamilya connect] Message non traité", error instanceof Error ? error.message : "erreur");
    // Rien n'est gardé : le téléphone pourra renvoyer le même message (un choix déjà payé reste « utilisé »).
    if (claimed) await releaseMessage(admin, envelope.id).catch(() => {});
    return fail(500, "unavailable");
  }
}

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { loadTamilyaBrain } from "@/lib/ai/brain";
import { VOICE_NODE } from "@/lib/ai/flow-events";
import { startFlowTrace } from "@/lib/ai/flow-trace";
import { getAuthContext } from "@/lib/auth/session";
import { canUse } from "@/lib/site/features";
import { getConversation } from "@/lib/conversations/repository";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { getClientIp, hashIdentifier, isSameOrigin } from "@/lib/security/request";
import { GUEST_VOICE_USER, liveRelayUrl, liveTicketSecret, signLiveTicket } from "@/lib/voice-live/ticket";

/**
 * Ouvre une conversation vocale en direct : renvoie l'adresse du relais
 * Cloudflare avec un ticket signé (60 s). Administrateurs, et tout le monde quand le
 * vocal est allumé dans /admin/fonctionnalites.
 *
 * Exception : la carte de la page « Mayotte » (`map`) est ouverte à tous, même sans
 * compte, avec un nombre d'appels limité par appareil, par adresse IP et au total.
 * Ce ticket « visiteur » ne donne que les deux boutons de la carte.
 */

/** Même cookie d'appareil que la conversation d'essai (route /api/chat). */
const DEVICE_COOKIE = "btm_device";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { supabase, user } = await getAuthContext();
  const body = (await request.json().catch(() => null)) as { manual?: unknown; conversationId?: unknown; map?: unknown } | null;
  const member = user && (await canUse(user, "vocal")) ? user : null;
  // Sans compte (ou vocal éteint pour ce compte) : seulement la carte de Mayotte.
  const guest = !member && body?.map === true;
  if (!member && !guest) return NextResponse.json({ error: "Connecte-toi à ton compte pour parler à Tamilya." }, { status: 403 });
  const relay = liveRelayUrl();
  const secret = liveTicketSecret();
  // Circuit : un appel refusé s'arrête en rouge sur le bloc qui l'a bloqué.
  const flow = startFlowTrace();
  flow.step("input", true);
  if (!relay || !secret) {
    flow.step(VOICE_NODE, false, "vocal non configuré");
    return NextResponse.json({ error: "Vocal en direct pas encore configuré (LIVE_RELAY_URL, LIVE_TICKET_SECRET)." }, { status: 503 });
  }

  let deviceId = request.cookies.get(DEVICE_COOKIE)?.value;
  const newDeviceId = guest && !user && (!deviceId || !/^[0-9a-f-]{36}$/.test(deviceId));
  if (newDeviceId) deviceId = randomUUID();

  // Erreur du compteur : l'appel est refusé (c'est BTM qui paie chaque appel).
  const limit = await consumeRateLimits(
    member
      ? [{ key: `voice-live:${member.id}`, rules: RATE_LIMIT_POLICIES.voiceSpeak }]
      : [
          { key: user ? `voice-map:${user.id}` : hashIdentifier(`voice-map-device:${deviceId}`), rules: RATE_LIMIT_POLICIES.voiceMapGuestDevice },
          { key: hashIdentifier(`voice-map-ip:${getClientIp(request.headers)}`), rules: RATE_LIMIT_POLICIES.voiceMapGuestIp },
          { key: "voice-map-all", rules: RATE_LIMIT_POLICIES.voiceMapGuestAll },
        ],
  ).catch(() => (member ? null : ({ allowed: false } as const)));
  if (limit && !limit.allowed) {
    flow.step("guard", false, guest ? "quota de la carte atteint (visiteur)" : "quota de conversations atteint");
    return NextResponse.json(
      { error: guest ? "Tu as beaucoup parlé à Tamilya sur la carte. Reviens un peu plus tard, ou connecte-toi à ton compte." : "Trop de conversations, réessaie dans un instant." },
      { status: 429 },
    );
  }
  flow.step("guard", true);

  // Conversation en cours : relue avec les droits de ce compte (celle d'un autre compte n'est pas trouvée).
  const asked = member && typeof body?.conversationId === "string" && /^[0-9a-f-]{36}$/i.test(body.conversationId) ? body.conversationId : null;
  const cid = asked && supabase ? (await getConversation(supabase, asked).catch(() => null))?.id : undefined;
  const ticket = member
    ? signLiveTicket(member, secret, Date.now(), body?.manual === true, cid, body?.map === true)
    : signLiveTicket(GUEST_VOICE_USER, secret, Date.now(), false, undefined, true, true);
  const url = `${relay.replace(/^http/, "ws")}/live?ticket=${encodeURIComponent(ticket)}`;
  // Mots validés de Tamilya : le téléphone y rapproche ce que Gemini écrit à l'oreille.
  const brain = await loadTamilyaBrain().catch(() => null);
  const lexicon = brain?.words.map((word) => word.shimaore) ?? [];
  // initiative : mode admin, Tamilya peut parler d'elle-même quand plus personne n'interagit.
  const response = NextResponse.json({ url, lexicon, initiative: member?.isAdmin === true }, { headers: { "Cache-Control": "no-store" } });
  if (newDeviceId && deviceId) {
    response.cookies.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}

import { NextResponse, type NextRequest } from "next/server";
import { loadTamilyaBrain } from "@/lib/ai/brain";
import { VOICE_NODE } from "@/lib/ai/flow-events";
import { startFlowTrace } from "@/lib/ai/flow-trace";
import { getAuthContext } from "@/lib/auth/session";
import { canUse } from "@/lib/site/features";
import { getConversation } from "@/lib/conversations/repository";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { liveRelayUrl, liveTicketSecret, signLiveTicket } from "@/lib/voice-live/ticket";

/**
 * Ouvre une conversation vocale en direct : renvoie l'adresse du relais
 * Cloudflare avec un ticket signé (60 s). Administrateurs, et tout le monde quand le
 * vocal est allumé dans /admin/fonctionnalites.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { supabase, user } = await getAuthContext();
  if (!user || !(await canUse(user, "vocal"))) return NextResponse.json({ error: "Le vocal en direct n'est pas ouvert pour l'instant." }, { status: 403 });
  const relay = liveRelayUrl();
  const secret = liveTicketSecret();
  // Circuit : un appel refusé s'arrête en rouge sur le bloc qui l'a bloqué.
  const flow = startFlowTrace();
  flow.step("input", true);
  if (!relay || !secret) {
    flow.step(VOICE_NODE, false, "vocal non configuré");
    return NextResponse.json({ error: "Vocal en direct pas encore configuré (LIVE_RELAY_URL, LIVE_TICKET_SECRET)." }, { status: 503 });
  }

  const limit = await consumeRateLimits([{ key: `voice-live:${user.id}`, rules: RATE_LIMIT_POLICIES.voiceSpeak }]).catch(() => null);
  if (limit && !limit.allowed) {
    flow.step("guard", false, "quota de conversations atteint");
    return NextResponse.json({ error: "Trop de conversations, réessaie dans un instant." }, { status: 429 });
  }
  flow.step("guard", true);

  const body = (await request.json().catch(() => null)) as { manual?: unknown; conversationId?: unknown } | null;
  // Conversation en cours : relue avec les droits de ce compte (celle d'un autre compte n'est pas trouvée).
  const asked = typeof body?.conversationId === "string" && /^[0-9a-f-]{36}$/i.test(body.conversationId) ? body.conversationId : null;
  const cid = asked && supabase ? (await getConversation(supabase, asked).catch(() => null))?.id : undefined;
  const ticket = signLiveTicket(user, secret, Date.now(), body?.manual === true, cid);
  const url = `${relay.replace(/^http/, "ws")}/live?ticket=${encodeURIComponent(ticket)}`;
  // Mots validés de Tamilya : le téléphone y rapproche ce que Gemini écrit à l'oreille.
  const brain = await loadTamilyaBrain().catch(() => null);
  const lexicon = brain?.words.map((word) => word.shimaore) ?? [];
  // initiative : mode admin, Tamilya peut parler d'elle-même quand plus personne n'interagit.
  return NextResponse.json({ url, lexicon, initiative: user.isAdmin }, { headers: { "Cache-Control": "no-store" } });
}

import { NextResponse, type NextRequest } from "next/server";
import { loadAwaBrain } from "@/lib/ai/brain";
import { VOICE_NODE } from "@/lib/ai/flow-events";
import { startFlowTrace } from "@/lib/ai/flow-trace";
import { getAuthContext } from "@/lib/auth/session";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { isSameOrigin } from "@/lib/security/request";
import { liveRelayUrl, liveTicketSecret, signLiveTicket } from "@/lib/voice-live/ticket";

/**
 * Ouvre une conversation vocale en direct : renvoie l'adresse du relais
 * Cloudflare avec un ticket signé (60 s). Administrateurs seulement, comme le
 * mode vocal actuel.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { user } = await getAuthContext();
  if (!user?.isAdmin) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
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

  const body = (await request.json().catch(() => null)) as { manual?: unknown } | null;
  const ticket = signLiveTicket(user, secret, Date.now(), body?.manual === true);
  const url = `${relay.replace(/^http/, "ws")}/live?ticket=${encodeURIComponent(ticket)}`;
  // Mots validés de Tamilya : le téléphone y rapproche ce que Gemini écrit à l'oreille.
  const brain = await loadAwaBrain().catch(() => null);
  const lexicon = brain?.words.map((word) => word.shimaore) ?? [];
  return NextResponse.json({ url, lexicon }, { headers: { "Cache-Control": "no-store" } });
}

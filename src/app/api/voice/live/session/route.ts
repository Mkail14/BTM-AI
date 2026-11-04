import { NextResponse, type NextRequest } from "next/server";
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
  if (!relay || !secret) return NextResponse.json({ error: "Vocal en direct pas encore configuré (LIVE_RELAY_URL, LIVE_TICKET_SECRET)." }, { status: 503 });

  const limit = await consumeRateLimits([{ key: `voice-live:${user.id}`, rules: RATE_LIMIT_POLICIES.voiceSpeak }]).catch(() => null);
  if (limit && !limit.allowed) return NextResponse.json({ error: "Trop de conversations, réessaie dans un instant." }, { status: 429 });

  const ticket = signLiveTicket(user, secret);
  const url = `${relay.replace(/^http/, "ws")}/live?ticket=${encodeURIComponent(ticket)}`;
  return NextResponse.json({ url }, { headers: { "Cache-Control": "no-store" } });
}

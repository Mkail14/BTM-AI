import { NextResponse } from "next/server";
import { getMayotteEvents } from "@/server/services/live/events";
import type { EventsResponse } from "@/lib/emploi/events";

/**
 * Prochains événements emploi à Mayotte (France Travail), pour la carte de la conversation
 * (bloc ```evenements-emploi```). Données publiques, gardées 30 minutes.
 */
export async function GET() {
  const result = await getMayotteEvents();
  if (!result.configured) return NextResponse.json({ configured: false } satisfies EventsResponse);
  if (result.error && !result.events.length) {
    return NextResponse.json({ error: "Événements emploi indisponibles pour le moment : réessaie dans un instant." } satisfies EventsResponse, { status: 503 });
  }
  return NextResponse.json({ configured: true, events: result.events, updatedAt: new Date().toISOString() } satisfies EventsResponse, {
    headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=3600" },
  });
}

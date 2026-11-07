import { NextResponse } from "next/server";
import { getCyclones } from "@/lib/cyclone/gdacs";
import type { CyclonesResponse } from "@/lib/cyclone/intent";

/**
 * Cyclones en cours autour de Mayotte, pour la carte de la conversation
 * (bloc ```carte-cyclones```). GET /api/cyclones — données publiques, gardées 15 minutes.
 */
export async function GET() {
  try {
    const cyclones = await getCyclones();
    return NextResponse.json({ cyclones, updatedAt: new Date().toISOString() } satisfies CyclonesResponse, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (error) {
    console.error("[cyclones] GDACS indisponible", error);
    return NextResponse.json({ error: "Carte des cyclones indisponible pour le moment : réessaie dans un instant." } satisfies CyclonesResponse, { status: 503 });
  }
}

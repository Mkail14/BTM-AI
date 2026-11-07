import { NextResponse, type NextRequest } from "next/server";
import { getCyclones } from "@/lib/cyclone/gdacs";
import type { CyclonesResponse } from "@/lib/cyclone/intent";

/**
 * Cyclones en cours, pour la carte de la conversation (bloc ```carte-cyclones```).
 * GET /api/cyclones : l'océan Indien autour de Mayotte. GET /api/cyclones?zone=monde : tous,
 * seulement quand la personne touche « Voir les autres ». Données publiques, gardées 15 minutes.
 */
export async function GET(request: NextRequest) {
  const zone = request.nextUrl.searchParams.get("zone") === "monde" ? "monde" : "ocean-indien";
  try {
    const cyclones = await getCyclones(zone);
    return NextResponse.json({ cyclones, updatedAt: new Date().toISOString() } satisfies CyclonesResponse, {
      // Le téléphone garde la réponse 5 minutes, puis la réutilise encore pendant qu'il en lit une nouvelle.
      headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" },
    });
  } catch (error) {
    console.error("[cyclones] GDACS indisponible", error);
    return NextResponse.json({ error: "Carte des cyclones indisponible pour le moment : réessaie dans un instant." } satisfies CyclonesResponse, { status: 503 });
  }
}

import { NextResponse } from "next/server";
import { getMayotteJobs } from "@/server/services/live/jobs";
import type { JobsResponse } from "@/lib/emploi/intent";

/**
 * Toutes les offres d'emploi en cours à Mayotte (Emploi Territorial, et France Travail quand l'accès est accordé), pour la liste de la
 * conversation (bloc ```offres-emploi```). La recherche et les filtres se font dans le
 * téléphone : une seule lecture, sans la description des offres. Données publiques, gardées 30 minutes.
 */
export async function GET() {
  const result = await getMayotteJobs();
  if (!result.configured) return NextResponse.json({ configured: false } satisfies JobsResponse);
  if (result.error && !result.offers.length) {
    return NextResponse.json({ error: "Offres d'emploi indisponibles pour le moment : réessaie dans un instant." } satisfies JobsResponse, { status: 503 });
  }
  return NextResponse.json({ configured: true, offers: result.offers, total: result.total, updatedAt: result.updatedAt, sources: result.sources } satisfies JobsResponse, {
    // Le téléphone garde la réponse 10 minutes, puis la réutilise encore pendant qu'il en lit une nouvelle.
    headers: { "Cache-Control": "public, max-age=600, stale-while-revalidate=3600" },
  });
}

import { NextResponse, type NextRequest } from "next/server";
import { getAuthContext } from "@/server/middlewares/session";
import { canUse } from "@/server/services/site/features";
import { getApplyForOffer } from "@/server/services/live/emploi-territorial-candidature";

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

/**
 * ESSAI ADMIN : comment postuler à une offre Emploi Territorial (bouton Postuler de la liste des offres).
 * Fonctionnalité « candidatures » : réservée aux admins tant qu'Emploi Territorial n'a pas donné son accord.
 */
export async function GET(request: NextRequest) {
  const { user } = await getAuthContext();
  if (!user || !(await canUse(user, "candidatures"))) return fail(403, "Pas encore ouvert.");
  const link = request.nextUrl.searchParams.get("lien") ?? "";
  try {
    const apply = await getApplyForOffer(link);
    if (!apply) return fail(400, "Offre inconnue.");
    return NextResponse.json({ apply }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (e) {
    console.error("[emploi] candidature illisible", link, e);
    return fail(503, "La page de l'offre ne répond pas : ouvre l'offre pour postuler.");
  }
}

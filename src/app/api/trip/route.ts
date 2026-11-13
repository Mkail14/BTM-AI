import { NextResponse, type NextRequest } from "next/server";
import { isInMayotte } from "@/lib/address";
import { getAuthContext } from "@/lib/auth/session";
import { canUse } from "@/lib/site/features";
import { getProfileContact } from "@/lib/profile-contact";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { planTrip, type TripChoice, type TripFailure, type TripPlan } from "@/lib/trip/plan";

/**
 * Trajet pour la carte de la conversation (bloc ```itineraire```).
 * GET /api/trip?to=cssm[&from=sada][&at=lat,lng]
 * Sans départ ni position : l'adresse enregistrée dans les paramètres.
 */

export type TripResponse = { plan: TripPlan } | (TripChoice & { message: string }) | { error: TripFailure | "unavailable"; message: string };

const MESSAGES: Record<TripFailure | "unavailable", string> = {
  no_destination: "Je n'ai pas trouvé ce lieu à Mayotte : essaie avec un autre nom ou la commune.",
  no_origin: "D'où pars-tu ? Donne ta position, ou enregistre ton adresse dans les paramètres.",
  no_route: "Le calcul du trajet n'a pas marché : réessaie dans un instant.",
  unavailable: "Trajet indisponible pour le moment : réessaie dans un instant.",
};

const fail = (error: TripFailure | "unavailable", status: number) =>
  NextResponse.json({ error, message: MESSAGES[error] } satisfies TripResponse, { status });

export async function GET(request: NextRequest) {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return NextResponse.json({ error: "unavailable", message: "Connecte-toi pour voir le trajet." }, { status: 401 });
  if (!(await canUse(user, "trajet"))) return NextResponse.json({ error: "unavailable", message: "Les trajets ne sont pas ouverts pour l'instant." }, { status: 403 });
  const params = request.nextUrl.searchParams;
  const to = (params.get("to") ?? "").trim().slice(0, 120);
  const from = (params.get("from") ?? "").trim().slice(0, 120) || null;
  const [lat, lng] = (params.get("at") ?? "").split(",").map(Number);
  const gps = Number.isFinite(lat) && Number.isFinite(lng) && isInMayotte(lat, lng) ? { lat, lng } : null;
  if (!to) return fail("no_destination", 400);

  try {
    // La recherche de lieux (Nominatim) demande de ne pas l'appeler en rafale.
    const limit = await consumeRateLimits([{ key: `trip:${user.id}`, rules: RATE_LIMIT_POLICIES.trip }]);
    if (!limit.allowed) return fail("unavailable", 429);
    const home = from || gps ? null : (await getProfileContact(supabase, user.id)).address;
    const plan = await planTrip({ to, from, gps }, home);
    if (typeof plan === "string") return fail(plan, plan === "no_route" ? 503 : 404);
    if ("choose" in plan) {
      const { choices } = plan.choose;
      const message = `Il y a plusieurs lieux : ${choices.slice(0, -1).join(", ")} ou ${choices.at(-1)} ?`;
      return NextResponse.json({ ...plan, message } satisfies TripResponse, { headers: { "Cache-Control": "private, no-store" } });
    }
    return NextResponse.json({ plan } satisfies TripResponse, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[trajet] Calcul impossible", error);
    return fail("unavailable", 503);
  }
}

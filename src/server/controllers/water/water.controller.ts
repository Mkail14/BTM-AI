import { NextResponse } from "next/server";
import { getAuthContext } from "@/server/middlewares/session";
import { canUse } from "@/server/services/site/features";
import { loadWater } from "@/server/services/water/store";
import { buildWaterMap } from "@/lib/water/map";

/**
 * Carte de l'eau, pour la conversation (bloc ```carte-eau```) : l'état de chaque lieu maintenant,
 * d'après le planning officiel de la SMAE validé dans /admin/eau et les coupures annoncées.
 * Réservée à qui a la fonctionnalité « eau » (les administrateurs pour l'instant).
 */
export async function GET() {
  const { user } = await getAuthContext();
  if (!user || !(await canUse(user, "eau"))) return NextResponse.json({ error: "La carte de l'eau arrive bientôt." }, { status: 403 });
  const { planning, alerts } = await loadWater();
  const map = buildWaterMap(planning, alerts);
  return NextResponse.json(user.isAdmin ? map : { ...map, unplaced: [] }, { headers: { "Cache-Control": "private, no-store" } });
}

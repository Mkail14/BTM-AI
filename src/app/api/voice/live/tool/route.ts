import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAuthContext } from "@/lib/auth/session";
import { canBuyBargeTickets } from "@/lib/barge/access";
import { canOrderFood } from "@/lib/food/access";
import { isSameOrigin } from "@/lib/security/request";
import { liveToolBlock } from "@/lib/voice-live/tools";

/**
 * Vocal en direct : Tamilya a actionné un bouton (réservation du code, repas,
 * barge, devis BTM). Renvoie le bloc à afficher dans la conversation, le même
 * qu'à l'écrit ; les droits du compte sont revérifiés ici.
 */

const bodySchema = z.object({
  name: z.string().max(40),
  args: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { user } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Demande invalide." }, { status: 400 });
  const [food, barge] = await Promise.all([canOrderFood(user).catch(() => false), canBuyBargeTickets(user).catch(() => false)]);
  const block = liveToolBlock(parsed.data.name, parsed.data.args, { food, barge });
  if (!block) return NextResponse.json({ error: "Ce bouton n'est pas disponible pour ce compte." }, { status: 404 });
  return NextResponse.json({ block });
}

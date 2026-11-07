import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { mayotteClock } from "@/lib/ai/clock";
import { getAuthContext } from "@/lib/auth/session";
import { canBuyBargeTickets } from "@/lib/barge/access";
import { canOrderFood } from "@/lib/food/access";
import { liveContextFor } from "@/lib/live";
import { isSameOrigin } from "@/lib/security/request";
import { liveToolBlock } from "@/lib/voice-live/tools";

/**
 * Vocal en direct : Tamilya a actionné un bouton (réservation du code, repas,
 * barge, devis BTM). Renvoie le bloc à afficher dans la conversation, le même
 * qu'à l'écrit ; les droits du compte sont revérifiés ici.
 */

/** Au vocal, on n'attend pas plus : une source trop lente est laissée de côté. */
const VOICE_INFO_WAIT_MS = 3_000;

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
  // Pas un tableau : juste une réponse pour Tamilya, lue sur l'horloge du serveur.
  if (parsed.data.name === "heure_mayotte") return NextResponse.json({ time: mayotteClock() });
  // Pas un tableau : des informations à jour (météo, services publics, communes…) que Tamilya dit à voix haute.
  if (parsed.data.name === "infos_mayotte") {
    const question = String(parsed.data.args.question ?? "").slice(0, 300);
    const info = question ? await liveContextFor(question, { maxWaitMs: VOICE_INFO_WAIT_MS }).catch(() => null) : null;
    return NextResponse.json({
      info: info
        ? `${info}\n\nRéponds en une ou deux phrases, avec seulement ce qui répond à la question ; ne lis pas les liens.`
        : "Rien trouvé dans les sources officielles : dis-le simplement, sans inventer.",
    });
  }
  const [food, barge] = await Promise.all([canOrderFood(user).catch(() => false), canBuyBargeTickets(user).catch(() => false)]);
  const block = liveToolBlock(parsed.data.name, parsed.data.args, { food, barge });
  if (!block) return NextResponse.json({ error: "Ce bouton n'est pas disponible pour ce compte." }, { status: 404 });
  return NextResponse.json({ block });
}

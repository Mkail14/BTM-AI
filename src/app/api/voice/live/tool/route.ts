import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { mayotteClock } from "@/lib/ai/clock";
import { getAuthContext } from "@/lib/auth/session";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { canBuyBargeTickets } from "@/lib/barge/access";
import { cycloneBlock } from "@/lib/cyclone/intent";
import { canOrderFood } from "@/lib/food/access";
import { getRecentMessages } from "@/lib/conversations/repository";
import { readingSpec, readingText, READING_BLOCK, type ReadingMode } from "@/lib/lecture/intent";
import { liveContextFor } from "@/lib/live";
import { getProfileContact } from "@/lib/profile-contact";
import { tripBlock } from "@/lib/trip/intent";
import { describeTrip, planTrip } from "@/lib/trip/plan";
import { isSameOrigin } from "@/lib/security/request";
import { liveToolBlock, readingSubject } from "@/lib/voice-live/tools";

/**
 * Vocal en direct : Tamilya a actionné un bouton (réservation du code, repas,
 * barge, devis BTM). Renvoie le bloc à afficher dans la conversation, le même
 * qu'à l'écrit ; les droits du compte sont revérifiés ici.
 */

/** Au vocal, on n'attend pas plus : une source trop lente est laissée de côté. */
const VOICE_INFO_WAIT_MS = 3_000;
/** Cyclones : la toute première lecture de GDACS prend quelques secondes de plus (ensuite, elle est gardée). */
const CYCLONE_INFO_WAIT_MS = 8_000;

const bodySchema = z.object({
  name: z.string().max(40),
  args: z.record(z.string(), z.unknown()).default({}),
  /** Conversation en cours : la lecture en 3D y cherche l'histoire collée par la personne. */
  conversationId: z.uuid().nullish(),
});

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  const { supabase, user } = await getAuthContext();
  if (!user) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  if (!user.isAdmin) return NextResponse.json({ error: "Réservé aux administrateurs." }, { status: 403 });
  const limit = await consumeRateLimits([{ key: `voice-live-tool:${user.id}`, rules: RATE_LIMIT_POLICIES.voiceLiveTool }]).catch(() => null);
  if (limit && !limit.allowed) return NextResponse.json({ error: "Trop de demandes, réessaie dans un instant." }, { status: 429 });
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
  // Carte du trajet : le bloc s'affiche dans la conversation, et Tamilya dit les temps à voix haute.
  if (parsed.data.name === "itineraire") {
    const to = String(parsed.data.args.vers ?? "").trim().slice(0, 120);
    const from = String(parsed.data.args.depuis ?? "").trim().slice(0, 120) || null;
    if (!to) return NextResponse.json({ info: "Demande-lui où elle veut aller." });
    const home = from || !supabase ? null : (await getProfileContact(supabase, user.id).catch(() => null))?.address ?? null;
    const plan = await planTrip({ to, from, gps: null }, home).catch(() => "no_route" as const);
    const said =
      plan === "no_destination"
        ? "Lieu introuvable à Mayotte : demande-lui un autre nom ou la commune."
        : plan === "no_origin"
          ? "Pas d'adresse enregistrée : la carte est à l'écran, dis-lui de toucher « Ma position » ou de dire d'où elle part."
          : plan === "no_route"
            ? "Le calcul du trajet n'a pas marché : dis-lui de réessayer dans un instant."
            : `${describeTrip(plan)} Dis seulement le temps en voiture et, si c'est utile, à pied, en une phrase.`;
    return NextResponse.json({ trip: plan === "no_destination" ? null : tripBlock({ to, from }).trim(), info: said });
  }
  // Lecture en 3D : l'histoire écrite ou collée plus haut dans la conversation est lue avec les voix
  // et les bruits ; l'appel se met en pause pendant la lecture (useLiveVoiceConversation).
  if (parsed.data.name === "lecture_3d") {
    // Une histoire demandée (sujet) est inventée ; sans sujet, le texte écrit plus haut est lu ;
    // sans texte non plus, c'est une histoire inventée (jamais de photo à prendre en plein appel).
    const subject = readingSubject(parsed.data.args);
    let mode: ReadingMode = { kind: "histoire", request: subject || "Une histoire" };
    if (!subject) {
      const recent = parsed.data.conversationId && supabase ? await getRecentMessages(supabase, parsed.data.conversationId, 8).catch(() => []) : [];
      const asked = recent.filter((m) => m.role === "user").map((m) => m.content).reverse();
      const story = asked.length ? readingText(asked[0], asked.slice(1)) : null;
      if (story) mode = { kind: "texte", text: story };
    }
    return NextResponse.json({
      reading: "```" + READING_BLOCK + "\n" + readingSpec(mode) + "\n```",
      info: "La lecture en 3D démarre à l'écran et dans ses écouteurs : ne dis rien, l'appel se met en pause et reprendra après.",
    });
  }
  // Carte des cyclones : elle s'ajoute à la conversation, et Tamilya dit l'essentiel à voix haute.
  if (parsed.data.name === "carte_cyclones") {
    // Les cyclones (GDACS) et les articles des journaux de Mayotte qui en parlent, ensemble.
    const said = await liveContextFor("cyclone", { maxWaitMs: CYCLONE_INFO_WAIT_MS }).catch(() => null);
    return NextResponse.json({
      trip: cycloneBlock().trim(),
      info: said
        ? `${said}\n\nLa carte est à l'écran. Dis en une ou deux phrases ce qui est sûr, ce qui est prévu et à quel point c'est probable pour Mayotte ; un effet (pluie, vent, mer) seulement si un journal le dit, en le nommant.`
        : "La carte est à l'écran, mais les données des cyclones ne répondent pas : dis-le simplement.",
    });
  }
  const [food, barge] = await Promise.all([canOrderFood(user).catch(() => false), canBuyBargeTickets(user).catch(() => false)]);
  const block = liveToolBlock(parsed.data.name, parsed.data.args, { food, barge });
  if (!block) return NextResponse.json({ error: "Ce bouton n'est pas disponible pour ce compte." }, { status: 404 });
  return NextResponse.json({ block });
}

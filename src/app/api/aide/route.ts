import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAIProvider } from "@/lib/ai";
import { getAuthContext } from "@/lib/auth/session";
import { escapeHtml } from "@/lib/email/layout";
import { EMAIL_FROM_ADDRESS, emailConfigured, sendEmail } from "@/lib/email/send";
import { faqAsText, HELP_TOPICS } from "@/lib/help/faq";
import { consumeRateLimits, RATE_LIMIT_POLICIES } from "@/lib/rate-limit";
import { getClientIp, hashIdentifier, isSameOrigin } from "@/lib/security/request";

/**
 * Rond d'aide (HelpBubble) : deux demandes.
 *   chat  : une question à l'IA d'aide, qui répond à partir de la FAQ ;
 *   email : un message envoyé à l'équipe (contact@btm.yt), réponse à l'adresse donnée.
 * Ouvert sans compte, donc limité par compte ou par adresse IP.
 */
const TURN_MAX_CHARS = 1500;
// Les questions restent limitées à 1 500 caractères ; une réponse de l'assistant plus longue
// (renvoyée par le panneau dans l'historique) est coupée ici au lieu de refuser toute la demande.
const turnSchema = z
  .object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(8000) })
  .refine((t) => t.role === "assistant" || t.content.length <= TURN_MAX_CHARS, "Question trop longue.")
  .transform((t) => ({ role: t.role, content: t.content.slice(0, TURN_MAX_CHARS) }));

const bodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("chat"),
    messages: z
      .array(turnSchema)
      .min(1)
      .max(12)
      .refine((list) => list.at(-1)?.role === "user", "La dernière ligne doit être une question."),
  }),
  z.object({
    kind: z.literal("email"),
    topic: z.enum(HELP_TOPICS).optional(),
    email: z.string().trim().email().max(200),
    message: z.string().trim().min(5).max(3000),
    page: z.string().max(200).optional(),
  }),
]);

const SYSTEM = `Tu es l'assistant d'aide de BTM AI, le site de GROUPE BTM à Mayotte où l'on parle avec Tamilya, une IA qui apprend le shimaoré.
Tu aides les gens à utiliser le site : compte, quotas, code de la route, portefeuille, données.
Réponds en français, simplement, en 1 à 4 phrases, en tutoyant, en texte simple (pas de markdown, pas d'astérisques ni de titres). Appuie-toi d'abord sur les questions fréquentes ci-dessous.
Si tu ne sais pas, ou si la demande concerne un paiement, un compte bloqué ou un problème précis, dis-le franchement et propose l'onglet « Écrire » pour envoyer un e-mail à l'équipe.
N'invente jamais de fonctionnalité, de prix ni de délai. Tu n'es pas Tamilya : pour apprendre le shimaoré, invite à lui parler dans la conversation.

Questions fréquentes :
${faqAsText()}`;

const fail = (status: number, message: string) => NextResponse.json({ error: message }, { status });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return fail(403, "Requête refusée.");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "Message incomplet ou trop long.");
  const body = parsed.data;

  const { user, invalidBearer } = await getAuthContext();
  if (invalidBearer) return fail(401, "Ta session a expiré. Reconnecte-toi.");
  const who = user ? user.id : hashIdentifier(`ip:${getClientIp(request.headers)}`);
  const limit = await consumeRateLimits([
    { key: `help-${body.kind}:${who}`, rules: body.kind === "chat" ? RATE_LIMIT_POLICIES.helpChat : RATE_LIMIT_POLICIES.helpEmail },
  ]).catch(() => ({ allowed: false as const, retryAfterSeconds: 60 }));
  if (!limit.allowed) return fail(429, "Trop de demandes d'un coup. Réessaie dans un moment.");

  if (body.kind === "chat") {
    const ai = await getAIProvider();
    if (!ai.ok) return fail(503, "L'assistant d'aide est indisponible pour l'instant. Tu peux écrire à l'équipe.");
    let answer = "";
    try {
      for await (const chunk of ai.provider.stream({
        system: SYSTEM,
        messages: body.messages,
        maxOutputTokens: 500,
        signal: AbortSignal.timeout(25_000),
      })) {
        if (chunk.type === "text") answer += chunk.text;
      }
    } catch (error) {
      console.error("[aide] Réponse de l'assistant impossible", error);
      return fail(502, "L'assistant n'a pas pu répondre. Réessaie, ou écris à l'équipe.");
    }
    // Le panneau affiche du texte brut : gras et titres markdown retirés au cas où.
    answer = answer
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/^#+\s*/gm, "")
      .trim();
    if (!answer) return fail(502, "L'assistant n'a pas pu répondre. Réessaie, ou écris à l'équipe.");
    return NextResponse.json({ answer });
  }

  if (!emailConfigured()) return fail(503, `L'envoi est indisponible pour l'instant. Écris directement à ${EMAIL_FROM_ADDRESS}.`);
  // En-tête (qui, sujet, page), une ligne vide, puis le message.
  const lines = [
    ...[
      `De : ${body.email}${user ? ` (compte ${user.id})` : " (sans compte)"}`,
      body.topic ? `Sujet : ${body.topic}` : "",
      body.page ? `Page : ${body.page}` : "",
    ].filter(Boolean),
    "",
    body.message,
  ];
  try {
    await sendEmail(
      EMAIL_FROM_ADDRESS,
      {
        subject: `Aide BTM AI${body.topic ? ` (${body.topic})` : ""} — message de ${body.email}`,
        text: lines.join("\n"),
        html: `<div style="font:15px/1.6 system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(lines.join("\n"))}</div>`,
      },
      { replyTo: body.email },
    );
  } catch (error) {
    console.error("[aide] E-mail non envoyé", error);
    return fail(502, `L'envoi a échoué. Réessaie, ou écris directement à ${EMAIL_FROM_ADDRESS}.`);
  }
  return NextResponse.json({ sent: true });
}

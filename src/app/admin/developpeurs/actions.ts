"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/server/middlewares/admin-auth";
import { developerEmail, emailDeveloper, reviewDeveloperAccount, SUSPENSION_SUBJECT, type DeveloperStatus } from "@/server/services/developers/accounts";

const reviewSchema = z.strictObject({
  userId: z.uuid(),
  decision: z.enum(["approved", "suspended"]),
  note: z.string().trim().max(500),
});

const messageSchema = z.strictObject({
  userId: z.uuid(),
  subject: z.string().trim().min(3, "Donnez un objet au message.").max(120, "Objet : 120 caractères au plus."),
  body: z.string().trim().min(10, "Écrivez le message (10 caractères au moins).").max(4000, "Message : 4 000 caractères au plus."),
});

const DECISIONS: Record<DeveloperStatus, { done: string; subject: string; body: string }> = {
  approved: {
    done: "Accès rétabli.",
    subject: "Votre accès à Tamilya est rétabli",
    body: "Votre accès à Tamilya est rétabli : vos widgets et codes répondent de nouveau.\n\nRappel : confiez à Tamilya la mission que vous voulez, mais elle garde toujours son nom, son shimaoré et sa personnalité.",
  },
  suspended: {
    done: "Accès suspendu.",
    subject: SUSPENSION_SUBJECT,
    body: "Votre accès à Tamilya est suspendu : vos widgets et codes ne répondent plus. Pour le rétablir, répondez à cet e-mail.",
  },
};

const EMAIL_STATUS = {
  sent: "Le développeur est prévenu par e-mail.",
  not_configured: "E-mail NON envoyé : l'envoi d'e-mails n'est pas configuré (SMTP_PASSWORD).",
  failed: "E-mail NON envoyé : l'envoi a échoué, réessayez ou écrivez-lui directement.",
  no_address: "E-mail NON envoyé : ce compte n'a pas d'adresse e-mail.",
} as const;

/** Suspendre ou rétablir un développeur ; il est prévenu par e-mail (envoi attendu, résultat affiché). */
export async function reviewDeveloperAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Décision invalide." };
  const { userId, decision, note } = parsed.data;
  if (decision === "suspended" && !note) return { ok: false, message: "Donnez le motif : le développeur le recevra par e-mail." };
  if (!(await reviewDeveloperAccount(userId, decision, auth.user.id, note || null))) {
    return { ok: false, message: "L'enregistrement a échoué (migrations 20261216 et 20261217 appliquées ?)." };
  }
  revalidatePath("/admin/developpeurs");
  const decisionText = DECISIONS[decision];
  const email = await developerEmail(userId);
  const sent = email ? await emailDeveloper(email, decisionText.subject, note ? `${decisionText.body}\n\nMotif : ${note}` : decisionText.body) : "no_address";
  return { ok: true, message: `${decisionText.done} ${EMAIL_STATUS[sent]}` };
}

/** Message libre de BTM au développeur, par e-mail (il répond à contact@btm.yt). */
export async function messageDeveloperAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = messageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Message invalide." };
  const { userId, subject, body } = parsed.data;
  const email = await developerEmail(userId);
  if (!email) return { ok: false, message: EMAIL_STATUS.no_address };
  const sent = await emailDeveloper(email, subject, `${body}\n\nL'équipe BTM AI — répondez simplement à cet e-mail.`);
  return sent === "sent" ? { ok: true, message: `Message envoyé à ${email}.` } : { ok: false, message: EMAIL_STATUS[sent] };
}

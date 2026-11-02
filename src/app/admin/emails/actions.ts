"use server";

import { headers } from "next/headers";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { siteOrigin } from "@/lib/email/device";
import { isEmailSampleId, renderSample } from "@/lib/email/samples";
import { emailConfigured, sendEmail } from "@/lib/email/send";

/** Envoie un exemple à l'adresse de l'administrateur connecté, pour le voir dans sa vraie messagerie. */
export async function sendSampleAction(id: unknown): Promise<ActionResult> {
  const context = await requireAdminAction();
  if (!context?.user.email) return NOT_ADMIN;
  if (!isEmailSampleId(id)) return { ok: false, message: "Modèle inconnu." };
  if (!emailConfigured()) {
    return { ok: false, message: "Envoi non configuré : ajoutez SMTP_PASSWORD (mot de passe de contact@btm.yt) sur Vercel." };
  }

  const host = (await headers()).get("host");
  const origin = siteOrigin(host ? `https://${host}` : "https://btm.yt");
  try {
    const email = renderSample(id, origin, context.user.email);
    await sendEmail(context.user.email, { ...email, subject: `[Exemple] ${email.subject}` });
  } catch (error) {
    console.error("[admin/emails] Envoi de l'exemple impossible", error);
    return { ok: false, message: "L'envoi a échoué : vérifiez le mot de passe SMTP de contact@btm.yt." };
  }
  return { ok: true, message: `Exemple envoyé à ${context.user.email}.` };
}

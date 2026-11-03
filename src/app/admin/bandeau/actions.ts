"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { saveAnnouncement } from "@/lib/site/announcement";
import { ANNOUNCEMENT_LIMITS, isSafeAnnouncementLink } from "@/lib/site/announcement-rules";

const schema = z
  .strictObject({
    enabled: z.boolean(),
    text: z.string().trim().max(ANNOUNCEMENT_LIMITS.text, `Texte : ${ANNOUNCEMENT_LIMITS.text} caractères au plus.`),
    linkLabel: z.string().trim().max(ANNOUNCEMENT_LIMITS.linkLabel, `Texte du lien : ${ANNOUNCEMENT_LIMITS.linkLabel} caractères au plus.`),
    linkUrl: z
      .string()
      .trim()
      .max(ANNOUNCEMENT_LIMITS.linkUrl, `Adresse : ${ANNOUNCEMENT_LIMITS.linkUrl} caractères au plus.`)
      .refine(isSafeAnnouncementLink, "Adresse : une page du site (/partenaires) ou une adresse qui commence par https://."),
  })
  .refine((a) => !a.enabled || a.text !== "", "Écris le texte du bandeau avant de l'allumer.");

export async function saveAnnouncementAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  if (!(await saveAnnouncement(parsed.data, auth.user.id))) {
    return { ok: false, message: "L'enregistrement a échoué (migration 20261121000000_bandeau_accueil.sql appliquée ?)." };
  }
  revalidatePath("/");
  revalidatePath("/admin/bandeau");
  return {
    ok: true,
    message: parsed.data.enabled
      ? "Bandeau en ligne : les visiteurs le voient sur l'accueil, partout en moins de 30 secondes."
      : "Bandeau éteint : il n'apparaît plus sur l'accueil.",
  };
}

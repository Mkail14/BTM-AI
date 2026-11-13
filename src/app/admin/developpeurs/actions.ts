"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { notifyDeveloper, reviewDeveloperAccount, type DeveloperStatus } from "@/lib/developers/accounts";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const schema = z.strictObject({
  userId: z.uuid(),
  decision: z.enum(["approved", "suspended"]),
  note: z.string().trim().max(500),
});

const MESSAGES: Record<DeveloperStatus, { done: string; subject: string; body: string }> = {
  approved: {
    done: "Accès rétabli.",
    subject: "Votre accès à Tamilya est rétabli",
    body: "Votre accès à Tamilya est rétabli : vos widgets et codes répondent de nouveau.\n\nRappel : confiez à Tamilya la mission que vous voulez, mais elle garde toujours son nom, son shimaoré et sa personnalité.",
  },
  suspended: {
    done: "Accès suspendu.",
    subject: "Votre accès à Tamilya est suspendu",
    body: "Votre accès à Tamilya est suspendu : vos widgets et codes ne répondent plus. Pour le rétablir, répondez à cet e-mail.",
  },
};

/** Suspendre ou rétablir un développeur ; il est prévenu par e-mail. */
export async function reviewDeveloperAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Décision invalide." };
  const { userId, decision, note } = parsed.data;
  if (decision === "suspended" && !note) return { ok: false, message: "Donnez le motif : le développeur le verra." };
  if (!(await reviewDeveloperAccount(userId, decision, auth.user.id, note || null))) {
    return { ok: false, message: "L'enregistrement a échoué (migrations 20261216 et 20261217 appliquées ?)." };
  }
  const { data } = (await getSupabaseAdminClient()?.auth.admin.getUserById(userId)) ?? {};
  const email = data?.user?.email;
  const message = MESSAGES[decision];
  if (email) notifyDeveloper(email, message.subject, note ? `${message.body}\n\nMotif : ${note}` : message.body);
  revalidatePath("/admin/developpeurs");
  return { ok: true, message: `${message.done}${email ? " Le développeur est prévenu par e-mail." : ""}` };
}

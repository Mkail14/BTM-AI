"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_PRINCIPAL, requireAdminRoleAction, requirePrincipalAdminAction, type ActionResult } from "@/server/middlewares/admin-auth";
import { dismissCodeReset, resetAdminAccount } from "@/server/services/admin/code-reset";
import { countPending } from "@/server/services/admin/pending";

/** Pastille du bouton « Tableau de bord » de la conversation : un nombre, rien d'autre (rôle seul, pas le code). */
export async function pendingCountAction(): Promise<number> {
  const auth = await requireAdminRoleAction();
  if (!auth) return 0;
  return (await countPending(Boolean(auth.user.isPrincipalAdmin))).total;
}

const idSchema = z.strictObject({ userId: z.string().uuid() });

/** « Réinitialiser » : supprime le compte du délégué qui a perdu son code. */
export async function resetAccountAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Compte invalide." };
  const result = await resetAdminAccount(parsed.data.userId);
  if (result.ok) revalidatePath("/admin");
  return result;
}

export async function dismissResetAction(input: unknown): Promise<ActionResult> {
  const auth = await requirePrincipalAdminAction();
  if (!auth) return NOT_PRINCIPAL;
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Compte invalide." };
  const result = await dismissCodeReset(parsed.data.userId);
  if (result.ok) revalidatePath("/admin");
  return result;
}

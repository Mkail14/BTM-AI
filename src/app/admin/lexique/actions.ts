"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { invalidateAwaBrain } from "@/lib/ai/brain";
import { LEXICON_LIMITS } from "./limits";

const schema = z.object({
  id: z.uuid().nullable(),
  french: z.string().trim().min(1, "Écrivez la phrase en français.").max(LEXICON_LIMITS.phrase),
  shimaore: z.string().trim().min(1, "Écrivez la traduction en shimaoré.").max(LEXICON_LIMITS.phrase),
  context: z.string().trim().max(LEXICON_LIMITS.context),
  validatedBy: z.string().trim().min(1, "Indiquez qui a validé la traduction.").max(LEXICON_LIMITS.validatedBy),
  isActive: z.boolean(),
});

function done(message: string): ActionResult {
  invalidateAwaBrain();
  revalidatePath("/admin/lexique");
  return { ok: true, message };
}

/** Crée (id null) ou met à jour une expression. */
export async function saveLexiconAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };

  const { id, french, shimaore, context, validatedBy, isActive } = parsed.data;
  const row = { french, shimaore, context: context || null, validated_by: validatedBy, is_active: isActive };
  const { error } = id
    ? await auth.supabase.from("awa_lexicon").update(row).eq("id", id)
    : await auth.supabase.from("awa_lexicon").insert(row);
  if (error) {
    console.error("[admin] Enregistrement du lexique impossible", error);
    return { ok: false, message: "L'enregistrement a échoué. Réessayez." };
  }
  return done(id ? "Expression enregistrée." : "Expression ajoutée.");
}

export async function deleteLexiconAction(id: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Expression inconnue." };

  const { error } = await auth.supabase.from("awa_lexicon").delete().eq("id", parsed.data);
  if (error) {
    console.error("[admin] Suppression du lexique impossible", error);
    return { ok: false, message: "La suppression a échoué." };
  }
  return done("Expression supprimée.");
}

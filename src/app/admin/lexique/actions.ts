"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { invalidateAwaBrain } from "@/lib/ai/brain";
import { LEXICON_LIMITS, WORD_LIMITS } from "./limits";

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

const wordSchema = z.object({
  id: z.uuid().nullable(),
  french: z.string().trim().min(1, "Écrivez le mot en français.").max(WORD_LIMITS.word),
  shimaore: z.string().trim().min(1, "Écrivez le mot en shimaoré.").max(WORD_LIMITS.word),
  category: z.string().trim().max(WORD_LIMITS.category),
  isActive: z.boolean(),
});

/** Crée (id null) ou met à jour un mot du dictionnaire. */
export async function saveWordAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = wordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };

  const { id, french, shimaore, category, isActive } = parsed.data;
  const row = { french, shimaore, category: category || null, is_active: isActive };
  const { error } = id
    ? await auth.supabase.from("awa_words").update(row).eq("id", id)
    : await auth.supabase.from("awa_words").insert({ ...row, created_by: auth.user.id });
  if (error) {
    if (error.code === "23505") return { ok: false, message: `« ${french} → ${shimaore} » est déjà dans le dictionnaire.` };
    console.error("[admin] Enregistrement du mot impossible", error);
    return { ok: false, message: "L'enregistrement a échoué (migration 20261103000000_awa_words.sql appliquée ?)." };
  }
  return done(id ? "Mot enregistré." : `« ${french} » ajouté.`);
}

export async function deleteWordAction(id: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Mot inconnu." };

  const { error } = await auth.supabase.from("awa_words").delete().eq("id", parsed.data);
  if (error) {
    console.error("[admin] Suppression du mot impossible", error);
    return { ok: false, message: "La suppression a échoué." };
  }
  return done("Mot supprimé.");
}

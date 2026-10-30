"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { invalidateAwaBrain } from "@/lib/ai/brain";
import { teachWords } from "@/lib/ai/words-store";
import { parseWordList } from "@/lib/language/teaching";
import { LEXICON_LIMITS, WORD_LIMITS } from "./limits";

const variant = z.string().trim().max(LEXICON_LIMITS.phrase);

const schema = z.object({
  id: z.uuid().nullable(),
  french: z.string().trim().min(1, "Écrivez la phrase en français.").max(LEXICON_LIMITS.phrase),
  variants: z
    .object({ professionnelle: variant, mechante: variant, cool: variant })
    .refine((v) => Object.values(v).some(Boolean), "Écrivez au moins une façon de le dire en shimaoré."),
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

  const { id, french, variants, context, validatedBy, isActive } = parsed.data;
  // Version générale (colonne shimaore) : la professionnelle, sinon la première écrite.
  const shimaore = variants.professionnelle || variants.mechante || variants.cool;
  const row = {
    french,
    shimaore,
    variants: Object.fromEntries(Object.entries(variants).filter(([, text]) => text)),
    context: context || null,
    validated_by: validatedBy,
    is_active: isActive,
  };
  const { error } = id
    ? await auth.supabase.from("awa_lexicon").update(row).eq("id", id)
    : await auth.supabase.from("awa_lexicon").insert(row);
  if (error) {
    console.error("[admin] Enregistrement du lexique impossible", error);
    return { ok: false, message: "L'enregistrement a échoué (migration 20261103010000_lexicon_variants.sql appliquée ?)." };
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

const requestSchema = z.object({
  id: z.uuid(),
  french: z.string().trim().min(1, "Écrivez la traduction en français.").max(WORD_LIMITS.word),
});

/** Mot shimaoré signalé par Awa : la traduction entre dans le dictionnaire, Awa le saura au message suivant. */
export async function translateRequestAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };

  const { data: request, error: readError } = await auth.supabase
    .from("awa_word_requests")
    .select("shimaore")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (readError || !request) return { ok: false, message: "Demande introuvable (migration awa_word_requests appliquée ?)." };

  try {
    await teachWords(auth.supabase, auth.user.id, [{ french: parsed.data.french, shimaore: request.shimaore }]);
  } catch (error) {
    console.error("[admin] Traduction non enregistrée", error);
    return { ok: false, message: "L'enregistrement a échoué." };
  }
  const { error } = await auth.supabase.from("awa_word_requests").update({ status: "done" }).eq("id", parsed.data.id);
  if (error) console.error("[admin] Demande non marquée comme traitée", error);
  return done(`« ${request.shimaore} » = « ${parsed.data.french} » : Awa le sait maintenant.`);
}

/** Mot signalé à tort (faute de frappe, mot français…) : retiré de la liste sans rien apprendre. */
export async function ignoreRequestAction(id: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Demande inconnue." };

  const { error } = await auth.supabase.from("awa_word_requests").update({ status: "ignored" }).eq("id", parsed.data);
  if (error) {
    console.error("[admin] Demande non ignorée", error);
    return { ok: false, message: "L'opération a échoué." };
  }
  revalidatePath("/admin/lexique");
  return { ok: true, message: "Mot retiré de la liste." };
}

const importSchema = z.object({
  text: z.string().max(200_000, "Liste trop longue : collez-la en plusieurs fois."),
  category: z.string().trim().max(WORD_LIMITS.category),
});

/** Liste collée (une paire « français = shimaoré » par ligne) : la dernière traduction d'un mot remplace l'ancienne. */
export async function importWordsAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = importSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };

  const { words, rejected } = parseWordList(parsed.data.text);
  if (words.length === 0) return { ok: false, message: "Aucune ligne « français = shimaoré » trouvée." };
  try {
    await teachWords(auth.supabase, auth.user.id, words, parsed.data.category || null);
  } catch (error) {
    console.error("[admin] Import du dictionnaire impossible", error);
    return { ok: false, message: "L'import a échoué (migration 20261103000000_awa_words.sql appliquée ?)." };
  }
  const skipped = rejected.length ? ` ${rejected.length} ligne${rejected.length > 1 ? "s" : ""} ignorée${rejected.length > 1 ? "s" : ""} : ${rejected.slice(0, 3).join(" · ")}${rejected.length > 3 ? "…" : ""}` : "";
  return done(`${words.length} mot${words.length > 1 ? "s" : ""} appris.${skipped}`);
}

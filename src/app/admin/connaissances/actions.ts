"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { invalidateAwaBrain } from "@/lib/ai/brain";
import { KNOWLEDGE_LIMITS } from "./limits";

const schema = z.object({
  id: z.uuid().nullable(),
  title: z.string().trim().min(1, "Donnez un titre à la fiche.").max(KNOWLEDGE_LIMITS.title),
  content: z.string().trim().min(1, "La fiche est vide.").max(KNOWLEDGE_LIMITS.content),
  keywords: z
    .array(z.string().trim().max(KNOWLEDGE_LIMITS.keyword))
    .max(KNOWLEDGE_LIMITS.keywords)
    .transform((list) => [...new Set(list.filter(Boolean))]),
  isActive: z.boolean(),
});

function done(message: string): ActionResult {
  invalidateAwaBrain();
  revalidatePath("/admin/connaissances");
  return { ok: true, message };
}

/** Crée (id null) ou met à jour une fiche. */
export async function saveKnowledgeAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };

  const { id, title, content, keywords, isActive } = parsed.data;
  const row = { title, content, keywords, is_active: isActive };
  const { error } = id
    ? await auth.supabase.from("awa_knowledge").update(row).eq("id", id)
    : await auth.supabase.from("awa_knowledge").insert(row);
  if (error) {
    console.error("[admin] Enregistrement de la fiche impossible", error);
    return { ok: false, message: "L'enregistrement a échoué. Réessayez." };
  }
  return done(id ? "Fiche enregistrée." : "Fiche ajoutée.");
}

export async function deleteKnowledgeAction(id: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return { ok: false, message: "Fiche inconnue." };

  const { error } = await auth.supabase.from("awa_knowledge").delete().eq("id", parsed.data);
  if (error) {
    console.error("[admin] Suppression de la fiche impossible", error);
    return { ok: false, message: "La suppression a échoué." };
  }
  return done("Fiche supprimée.");
}

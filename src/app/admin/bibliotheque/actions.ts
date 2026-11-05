"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { addDocument } from "@/lib/library/store";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const addSchema = z.object({
  url: z.string().trim().max(1_000).optional(),
  title: z.string().trim().max(300).optional(),
  text: z.string().max(200_000).optional(),
  sourceName: z.string().trim().max(120).optional(),
  publishedAt: z.string().trim().max(40).optional(),
});

/** Ajoute un document : il reste « à valider » tant qu'un administrateur ne l'a pas publié. */
export async function addDocumentAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Données invalides." };
  const { url, text } = parsed.data;
  if (!url && !text?.trim()) return { ok: false, message: "Donne une adresse ou colle un texte." };
  if (!url && !parsed.data.title) return { ok: false, message: "Donne un titre à ce texte." };
  try {
    const done = await addDocument({ ...parsed.data, publishedAt: parsed.data.publishedAt || null }, auth.user.id);
    revalidatePath("/admin/bibliotheque");
    return { ok: true, message: `Ajouté, ${done.chunks} passage(s). Relis-le puis publie-le : Tamilya ne s'en sert qu'après.` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Ajout impossible." };
  }
}

const statusSchema = z.object({ id: z.uuid(), status: z.enum(["publie", "rejete", "a_valider"]) });

export async function setDocumentStatusAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = statusSchema.safeParse(input);
  const admin = getSupabaseAdminClient();
  if (!parsed.success || !admin) return { ok: false, message: "Données invalides." };
  const { error } = await admin
    .from("awa_library_documents")
    .update({ status: parsed.data.status, verified_at: new Date().toISOString() })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/bibliotheque");
  return { ok: true, message: parsed.data.status === "publie" ? "Publié : Tamilya s'en sert maintenant." : "Retiré : Tamilya ne s'en sert plus." };
}

export async function deleteDocumentAction(id: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = z.uuid().safeParse(id);
  const admin = getSupabaseAdminClient();
  if (!parsed.success || !admin) return { ok: false, message: "Données invalides." };
  const { error } = await admin.from("awa_library_documents").delete().eq("id", parsed.data);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/bibliotheque");
  return { ok: true, message: "Supprimé." };
}

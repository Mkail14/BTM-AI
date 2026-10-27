"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const target = z.union([z.object({ memoryId: z.uuid() }), z.object({ userId: z.uuid() })]);

/**
 * Supprime un souvenir, ou tous ceux d'un compte (demande d'effacement).
 * La mémoire n'est lisible que par son propriétaire (RLS) : la clé secrète est nécessaire.
 */
export async function deleteMemoryAction(input: unknown): Promise<ActionResult> {
  if (!(await requireAdminAction())) return NOT_ADMIN;
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, message: "SUPABASE_SECRET_KEY n'est pas définie." };
  const parsed = target.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Souvenir inconnu." };

  const query = admin.from("awa_memories").delete();
  const { error } =
    "memoryId" in parsed.data ? await query.eq("id", parsed.data.memoryId) : await query.eq("user_id", parsed.data.userId);
  if (error) {
    console.error("[admin] Suppression de la mémoire impossible", error);
    return { ok: false, message: "La suppression a échoué." };
  }
  revalidatePath("/admin/memoire");
  return { ok: true, message: "Supprimé." };
}

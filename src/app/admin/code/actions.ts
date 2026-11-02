"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { checkLaPosteNow, type LaPosteCheck } from "@/lib/code-exam/laposte";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const statusSchema = z.object({ id: z.uuid(), status: z.enum(["pending", "booked", "cancelled"]) });

const DONE: Record<"pending" | "booked" | "cancelled", string> = {
  booked: "Demande marquée réservée.",
  cancelled: "Demande annulée.",
  pending: "Demande remise à traiter.",
};

/**
 * Traitement à la main (en attendant le partenariat La Poste) : l'admin a
 * réservé la place sur le site de La Poste, ou annule la demande.
 */
export async function setCodeExamStatusAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Demande invalide." };
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, message: "SUPABASE_SECRET_KEY manquante sur le serveur." };
  const { data, error } = await admin
    .from("code_exam_requests")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id");
  if (error || !data?.length) {
    console.error("[admin/code] Statut non enregistré", error);
    return { ok: false, message: "L'enregistrement a échoué. Réessayez." };
  }
  revalidatePath("/admin/code");
  revalidatePath("/admin");
  return { ok: true, message: DONE[parsed.data.status] };
}

/** « Vérifier maintenant » : relit le site de La Poste et renvoie le détail de chaque étape. */
export async function checkLaPosteAction(): Promise<{ ok: true; check: LaPosteCheck } | { ok: false; message: string }> {
  const auth = await requireAdminAction();
  if (!auth) return { ok: false, message: NOT_ADMIN.message };
  const check = await checkLaPosteNow();
  revalidatePath("/admin");
  return { ok: true, check };
}

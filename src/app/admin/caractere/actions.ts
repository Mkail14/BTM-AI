"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { invalidateAwaBrain } from "@/lib/ai/brain";
import { DEFAULT_IDENTITY, DEFAULT_RULES } from "@/lib/ai/system-prompt";
import { CHARACTER_LIMITS } from "./limits";

const schema = z.object({
  name: z.string().trim().min(1, "Donnez-lui un nom.").max(CHARACTER_LIMITS.name),
  identity: z.string().trim().max(CHARACTER_LIMITS.text),
  rules: z.string().trim().max(CHARACTER_LIMITS.text),
});

/** Un texte vide ou identique à celui du code est enregistré null : le code reste la référence. */
const orNull = (value: string, fallback: string) => (value && value !== fallback ? value : null);

export async function saveCharacterAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };

  const { name, identity, rules } = parsed.data;
  const { data, error } = await auth.supabase
    .from("awa_settings")
    .update({
      name,
      identity: orNull(identity, DEFAULT_IDENTITY),
      rules: orNull(rules, DEFAULT_RULES),
      updated_by: auth.user.id,
    })
    .eq("id", 1)
    .select("id");
  if (error || !data?.length) {
    console.error("[admin] Enregistrement du caractère impossible", error);
    return { ok: false, message: "L'enregistrement a échoué (migration awa_brain appliquée ?)." };
  }

  invalidateAwaBrain();
  revalidatePath("/admin/caractere");
  revalidatePath("/admin/modele-ia");
  return { ok: true, message: "Enregistré. Awa l'applique dans la minute." };
}

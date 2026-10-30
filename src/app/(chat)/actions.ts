"use server";

import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { invalidateAwaBrain } from "@/lib/ai/brain";
import { teachWords } from "@/lib/ai/words-store";
import { TAUGHT_WORD_MAX } from "@/lib/language/teaching";

const PHRASE_MAX = 200; // contrainte de awa_lexicon

const schema = z.object({
  french: z.string().trim().min(1).max(PHRASE_MAX, "Phrase trop longue pour être apprise d'un coup."),
  shimaore: z.string().trim().min(1, "Écris la traduction.").max(PHRASE_MAX, "Traduction trop longue."),
});

/**
 * Clic sur un [[mot]] orange dans le chat : le maître donne la traduction,
 * Awa la garde pour toujours. Mot ou phrase courte → dictionnaire (la nouvelle
 * traduction remplace l'ancienne) ; phrase plus longue → expressions.
 */
export async function teachUnknownWordAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { french, shimaore } = parsed.data;

  try {
    if (french.length <= TAUGHT_WORD_MAX && shimaore.length <= TAUGHT_WORD_MAX) {
      await teachWords(auth.supabase, auth.user.id, [{ french, shimaore }]);
    } else {
      const { error } = await auth.supabase.from("awa_lexicon").insert({
        french,
        shimaore,
        validated_by: auth.user.email ?? "Maître d'Awa",
      });
      if (error) throw error;
    }
  } catch (error) {
    console.error("[chat] Traduction non enregistrée", error);
    return { ok: false, message: "Pas enregistré, réessaie." };
  }
  invalidateAwaBrain();
  return { ok: true, message: `${french} → ${shimaore}` };
}

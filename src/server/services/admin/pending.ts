import "server-only";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { listCodeResets } from "./code-reset";

/**
 * Ce qui attend un administrateur, compté dans la pastille (tableau de bord,
 * bouton de la conversation) : mots shimaoré à traduire pour tous, et
 * demandes « code oublié » pour l'administrateur principal seulement.
 */
export type PendingCounts = { codeResets: number; wordsToTranslate: number; total: number };

export async function countPending(principal: boolean): Promise<PendingCounts> {
  const admin = getSupabaseAdminClient();
  const [resets, words] = await Promise.all([
    principal ? listCodeResets().then((list) => list.length, () => 0) : 0,
    admin
      ? Promise.resolve(admin.from("awa_word_requests").select("id", { count: "exact", head: true }).eq("status", "pending")).then(
          ({ count, error }) => (error ? 0 : (count ?? 0)),
          () => 0,
        )
      : 0,
  ]);
  return { codeResets: resets, wordsToTranslate: words, total: resets + words };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPastTalks, type PastTalks } from "./past-talks";

const TALKS = 6;
const MESSAGES_PER_TALK = 6;

/**
 * Dernières conversations d'un compte, sans celle en cours. Toujours filtré sur ce compte
 * (le vocal en direct lit avec la clé secrète, sans session). Vide en cas de souci : jamais bloquant.
 */
export async function getPastTalks(
  client: SupabaseClient,
  userId: string,
  options: { excludeId?: string | null } = {},
): Promise<PastTalks> {
  let query = client
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(TALKS);
  if (options.excludeId) query = query.neq("id", options.excludeId);
  const { data: conversations, error } = await query;
  if (error) throw error;
  const rows = conversations ?? [];
  const messages = await Promise.all(
    rows.map(async (c) => {
      const { data } = await client
        .from("messages")
        .select("conversation_id, role, content, created_at")
        .eq("conversation_id", c.id)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(MESSAGES_PER_TALK);
      return data ?? [];
    }),
  );
  return buildPastTalks(rows, messages.flat());
}

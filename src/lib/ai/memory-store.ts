import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoryFact } from "./memory";

const MAX_MEMORIES = 30;

/** Mémoire de l'utilisateur connecté (RLS : uniquement la sienne). */
export async function getMemories(supabase: SupabaseClient): Promise<MemoryFact[]> {
  const { data, error } = await supabase
    .from("awa_memories")
    .select("kind, content")
    .order("updated_at", { ascending: false })
    .limit(MAX_MEMORIES);
  if (error) throw error;
  return data ?? [];
}

/** Enregistre ou remplace (une valeur par sorte) les informations repérées. */
export async function saveMemories(supabase: SupabaseClient, userId: string, facts: readonly MemoryFact[]) {
  if (facts.length === 0) return;
  const { error } = await supabase
    .from("awa_memories")
    .upsert(
      facts.map((fact) => ({ user_id: userId, kind: fact.kind, content: fact.content })),
      { onConflict: "user_id,kind" },
    );
  if (error) throw error;
}

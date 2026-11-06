import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMemoryRequest,
  isMemoryAllowed,
  MEMORY_SYSTEM_PROMPT,
  parseMemoryUpdates,
  shouldLearnFrom,
  type MemoryFact,
  type MemoryUpdate,
} from "./memory";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { completeText } from "./complete";
import type { AIProvider } from "./types";

const MAX_MEMORIES = 40;

type MemoryRow = { kind: string; content: string; updated_at: string };

/** Souvenirs que le vérificateur accepte, avec leur date. */
const toFacts = (rows: readonly MemoryRow[] | null): MemoryFact[] =>
  (rows ?? []).filter((fact) => isMemoryAllowed(fact.content)).map((fact) => ({ kind: fact.kind, content: fact.content, since: fact.updated_at }));

/** Mémoire de l'utilisateur connecté (RLS : uniquement la sienne), sans les souvenirs que le vérificateur refuse. */
export async function getMemories(supabase: SupabaseClient): Promise<MemoryFact[]> {
  const { data, error } = await supabase
    .from("awa_memories")
    .select("kind, content, updated_at")
    .order("updated_at", { ascending: false })
    .limit(MAX_MEMORIES);
  if (error) throw error;
  return toFacts(data);
}

/**
 * Souvenirs d'un compte précis, avec le client du serveur (sans session : vocal
 * en direct, appelé par le relais). Toujours filtré sur ce compte.
 */
export async function getMemoriesFor(admin: SupabaseClient, userId: string): Promise<MemoryFact[]> {
  const { data, error } = await admin
    .from("awa_memories")
    .select("kind, content, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(MAX_MEMORIES);
  if (error) throw error;
  return toFacts(data);
}

/** Client d'écriture : la clé secrète si elle est là, sinon celui de la session (développement). */
const writer = (supabase: SupabaseClient) => getSupabaseAdminClient() ?? supabase;

/**
 * Enregistre ou remplace (une valeur par sorte) les informations repérées.
 * Écrit par le serveur seul, avec le compte de la session : un compte ne peut
 * pas glisser de faux souvenirs en appelant la base directement.
 */
export async function saveMemories(supabase: SupabaseClient, userId: string, facts: readonly MemoryFact[]) {
  if (facts.length === 0) return;
  const { error } = await writer(supabase)
    .from("awa_memories")
    .upsert(
      facts.map((fact) => ({ user_id: userId, kind: fact.kind, content: fact.content })),
      { onConflict: "user_id,kind" },
    );
  if (error) throw error;
}

async function applyMemoryUpdates(supabase: SupabaseClient, userId: string, updates: readonly MemoryUpdate[]) {
  const forgotten = updates.filter((u) => u.content === null).map((u) => u.kind);
  await saveMemories(
    supabase,
    userId,
    updates.filter((u): u is MemoryFact => u.content !== null),
  );
  if (forgotten.length > 0) {
    const { error } = await writer(supabase).from("awa_memories").delete().eq("user_id", userId).in("kind", forgotten);
    if (error) throw error;
  }
}

/**
 * Le modèle du moment lit le message et dit ce qu'il faut retenir ; la mémoire,
 * elle, reste dans Supabase. Changer d'API ne fait donc rien oublier à Tamilya.
 * À lancer après la réponse (after) : n'en retarde jamais l'affichage.
 */
export async function learnFromMessage(
  supabase: SupabaseClient,
  userId: string,
  provider: AIProvider,
  input: { message: string; previousReply: string | null; memories: readonly MemoryFact[] },
) {
  if (!shouldLearnFrom(input.message)) return;
  const output = await completeText(provider, {
    system: MEMORY_SYSTEM_PROMPT,
    content: buildMemoryRequest(input.memories, input.previousReply, input.message),
  });
  await applyMemoryUpdates(supabase, userId, parseMemoryUpdates(output));
}

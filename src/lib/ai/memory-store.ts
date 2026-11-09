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

/**
 * Mémoire coupée par la personne (Paramètres) : rangé dans son compte (user_metadata), pas en
 * base. Coupée, Tamilya ne lit plus ses souvenirs et n'en ajoute plus ; ils restent effaçables.
 */
export const MEMORY_OFF_KEY = "memoire_coupee";
export const memoryOnIn = (metadata: unknown) =>
  !(metadata && typeof metadata === "object" && (metadata as Record<string, unknown>)[MEMORY_OFF_KEY] === true);

/** Mémoire allumée pour la session en cours ? (Lue dans le jeton, rafraîchi à chaque changement.) */
export async function isMemoryOn(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase.auth.getClaims().catch(() => ({ data: null }));
  return memoryOnIn(data?.claims?.user_metadata);
}

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
  const [account, { data, error }] = await Promise.all([
    admin.auth.admin.getUserById(userId).catch(() => null),
    admin.from("awa_memories").select("kind, content, updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(MAX_MEMORIES),
  ]);
  if (!memoryOnIn(account?.data?.user?.user_metadata)) return [];
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
 * Lancé pendant la réponse, sans la retarder. Rend ce qui change (pour « Mémoire mise à jour »).
 */
export async function learnFromMessage(
  supabase: SupabaseClient,
  userId: string,
  provider: AIProvider,
  input: { message: string; previousReply: string | null; memories: readonly MemoryFact[] },
): Promise<MemoryUpdate[]> {
  if (!shouldLearnFrom(input.message)) return [];
  const output = await completeText(provider, {
    system: MEMORY_SYSTEM_PROMPT,
    content: buildMemoryRequest(input.memories, input.previousReply, input.message),
  });
  const updates = parseMemoryUpdates(output);
  await applyMemoryUpdates(supabase, userId, updates);
  return newMemoryUpdates(input.memories, updates);
}

/** En clair pour la personne : « J'habite à Mamoudzou », « Oublié : … ». */
export function describeMemoryUpdates(known: readonly MemoryFact[], updates: readonly MemoryUpdate[]): string[] {
  return updates.flatMap((u) => {
    if (u.content !== null) return [u.content];
    const before = known.find((fact) => fact.kind === u.kind);
    return before ? [`Oublié : ${before.content}`] : [];
  });
}

/** Ce qui change vraiment : un souvenir nouveau ou modifié, ou un souvenir connu qu'on oublie. */
export function newMemoryUpdates(known: readonly MemoryFact[], updates: readonly MemoryUpdate[]): MemoryUpdate[] {
  return updates.filter((u) => {
    const before = known.find((fact) => fact.kind === u.kind);
    return u.content === null ? Boolean(before) : before?.content !== u.content;
  });
}

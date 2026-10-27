import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPersonalityId, type PersonalityId } from "@/lib/ai/personalities";
import type {
  ChatRole,
  ChatTurn,
  ConversationSummary,
  MessageStatus,
  StoredMessage,
} from "@/lib/chat/types";

/**
 * Accès aux conversations. Toutes les fonctions reçoivent un client lié à la
 * session de l'utilisateur : RLS garantit qu'il ne lit et n'écrit que ses
 * propres données, même si un identifiant est modifié côté client.
 */

type ConversationRow = { id: string; title: string; updated_at: string };
type MessageRow = {
  id: string;
  role: ChatRole;
  content: string;
  status: MessageStatus;
  created_at: string;
};

function toSummary(row: ConversationRow): ConversationSummary {
  return { id: row.id, title: row.title, updatedAt: row.updated_at };
}

function toMessage(row: MessageRow): StoredMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function listConversations(supabase: SupabaseClient, limit = 50) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as ConversationRow[]).map(toSummary);
}

export async function getConversation(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toSummary(data as ConversationRow) : null;
}

/** Derniers messages d'une conversation, du plus ancien au plus récent. */
export async function getRecentMessages(
  supabase: SupabaseClient,
  conversationId: string,
  limit: number,
) {
  const { data, error } = await supabase
    .from("messages")
    .select("id, role, content, status, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as MessageRow[]).map(toMessage).reverse();
}

export async function countMessages(supabase: SupabaseClient, conversationId: string) {
  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId);
  if (error) throw error;
  return count ?? 0;
}

export async function createConversation(
  supabase: SupabaseClient,
  userId: string,
  title: string,
) {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title })
    .select("id, title, updated_at")
    .single();
  if (error) throw error;
  return toSummary(data as ConversationRow);
}

export async function insertMessage(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    userId: string;
    role: ChatRole;
    content: string;
    status?: MessageStatus;
  },
) {
  const { error } = await supabase.from("messages").insert({
    conversation_id: input.conversationId,
    user_id: input.userId,
    role: input.role,
    content: input.content,
    status: input.status ?? "complete",
  });
  if (error) throw error;
}

/** Enregistre une conversation anonyme après validation explicite de l'utilisateur. */
export async function importConversation(
  supabase: SupabaseClient,
  userId: string,
  title: string,
  turns: ChatTurn[],
) {
  const conversation = await createConversation(supabase, userId, title);
  // Horodatages croissants pour conserver l'ordre d'origine.
  const base = Date.now() - turns.length;
  const { error } = await supabase.from("messages").insert(
    turns.map((turn, index) => ({
      conversation_id: conversation.id,
      user_id: userId,
      role: turn.role,
      content: turn.content,
      status: "complete",
      created_at: new Date(base + index).toISOString(),
    })),
  );
  if (error) {
    await supabase.from("conversations").delete().eq("id", conversation.id);
    throw error;
  }
  return conversation;
}

/** Renvoie true si une conversation a bien été supprimée. */
export async function deleteConversation(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function getProfile(supabase: SupabaseClient, userId: string) {
  // « * » plutôt qu'une liste : la page reste fonctionnelle si la migration
  // de la colonne personality n'est pas encore appliquée.
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  // undefined : colonne absente (migration non appliquée), le choix n'est pas proposé.
  const personality: PersonalityId | null | undefined =
    data && "personality" in data ? (isPersonalityId(data.personality) ? data.personality : null) : undefined;
  return { displayName: (data?.display_name as string | null) ?? null, personality };
}

export async function updatePersonality(
  supabase: SupabaseClient,
  userId: string,
  personality: PersonalityId,
) {
  const { error } = await supabase
    .from("profiles")
    .update({ personality })
    .eq("id", userId);
  if (error) throw error;
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  displayName: string | null,
) {
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId);
  if (error) throw error;
}

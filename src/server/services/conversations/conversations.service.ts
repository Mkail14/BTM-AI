import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { quickTitle } from "@/lib/chat/title";
import type { ChatTurn } from "@/lib/chat/types";
import * as conversations from "@/server/models/conversations.model";

/**
 * Règles des conversations. La propriété est garantie par RLS : le client reçu
 * est celui de la session, il ne voit et ne supprime que les conversations du compte.
 */

/** Tamilya Connect garde les conversations sur le téléphone : assez de messages pour les relire sans internet. */
export const MESSAGES_FOR_CONNECT = 60;

export function listMine(supabase: SupabaseClient) {
  return conversations.listConversations(supabase);
}

export function messagesForConnect(supabase: SupabaseClient, conversationId: string) {
  return conversations.getRecentMessages(supabase, conversationId, MESSAGES_FOR_CONNECT);
}

/** true si la conversation existait et appartenait au compte. Ses messages partent par cascade. */
export function remove(supabase: SupabaseClient, conversationId: string) {
  return conversations.deleteConversation(supabase, conversationId);
}

/**
 * Enregistre dans le compte une conversation commencée sans compte, titrée
 * d'après le premier message de la personne. Tout ou rien : si les messages
 * ne passent pas, la conversation vide est retirée.
 */
export async function importGuestConversation(supabase: SupabaseClient, userId: string, turns: ChatTurn[]) {
  const firstUser = turns.find((turn) => turn.role === "user")?.content ?? "";
  const conversation = await conversations.createConversation(supabase, userId, quickTitle(firstUser));
  try {
    await conversations.insertMessages(supabase, conversation.id, userId, turns);
  } catch (error) {
    await conversations.deleteOwnedConversation(supabase, conversation.id, userId);
    throw error;
  }
  return conversation;
}

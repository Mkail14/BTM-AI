import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanAiTitle } from "@/lib/chat/title";
import { completeText } from "./complete";
import type { AIProvider } from "./types";

const SYSTEM = `Tu donnes un titre à une conversation, pour une liste d'historique.
Réponds avec le titre seul : 2 à 5 mots en français, qui disent le sujet (ex. « Passer le code de la route », « Commande de repas », « Horaires de la poste »).
Pas de salutation, pas de guillemets, pas de point final, pas d'emoji.`;

/**
 * Tâche de fond, après la première réponse : remplace le titre provisoire de la
 * conversation par le sujet résumé par l'IA. En cas d'échec, le titre provisoire reste.
 */
export async function nameConversation(
  supabase: SupabaseClient,
  provider: AIProvider,
  conversationId: string,
  { message, reply }: { message: string; reply: string },
) {
  const raw = await completeText(provider, {
    system: SYSTEM,
    content: `Message de la personne :\n${message.slice(0, 1500)}\n\nRéponse de Tamilya :\n${reply.slice(0, 800)}`,
    maxOutputTokens: 200,
    timeoutMs: 15_000,
  });
  const title = cleanAiTitle(raw);
  if (!title) return;
  const { error } = await supabase.from("conversations").update({ title }).eq("id", conversationId);
  if (error) throw error;
}

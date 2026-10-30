import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ChatView } from "@/components/chat/ChatView";
import type { UiMessage } from "@/components/chat/MessageItem";
import { knownTranslations, loadAwaBrain } from "@/lib/ai/brain";
import { requireUser } from "@/lib/auth/session";
import { fillKnownWords } from "@/lib/language/unknown-words";
import { CHAT_LIMITS } from "@/lib/chat/limits";
import { conversationIdSchema } from "@/lib/chat/validation";
import { getConversation, getRecentMessages } from "@/lib/conversations/repository";

export const metadata: Metadata = { title: "Conversation" };

export default async function ConversationPage({ params }: PageProps<"/c/[id]">) {
  const { id } = await params;
  if (!conversationIdSchema.safeParse(id).success) notFound();

  const { supabase, user } = await requireUser(`/c/${id}`);
  // RLS : la conversation d'un autre utilisateur est introuvable (404), jamais
  // lisible. Les deux lectures partent ensemble (un seul aller-retour réseau).
  const [conversation, stored, brain] = await Promise.all([
    getConversation(supabase, id),
    getRecentMessages(supabase, id, CHAT_LIMITS.conversationMaxMessages),
    user.isAdmin ? loadAwaBrain() : null,
  ]);
  if (!conversation) notFound();
  // Maître d'Awa : les [[mots]] qu'il a traduits depuis s'affichent en shimaoré.
  const known = brain ? knownTranslations(brain) : null;
  const messages: UiMessage[] = stored.map((m) => ({
    id: m.id,
    role: m.role,
    content: known && m.role === "assistant" ? fillKnownWords(m.content, known) : m.content,
    status: m.status,
    notice:
      m.status === "error"
        ? "La réponse n'a pas pu être générée."
        : m.status === "interrupted"
          ? "Réponse interrompue."
          : undefined,
  }));

  return <ChatView key={id} conversationId={id} initialMessages={messages} />;
}

import { ChatView } from "@/components/chat/ChatView";
import { safeNextPath } from "@/lib/auth/redirect";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const authPrompt =
    params.auth === "required"
      ? { next: safeNextPath(typeof params.next === "string" ? params.next : null) }
      : null;

  return <ChatView key="accueil" conversationId={null} initialMessages={[]} authPrompt={authPrompt} />;
}

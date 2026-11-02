import { ChatView } from "@/components/chat/ChatView";
import { GuestHome } from "@/components/landing/GuestHome";
import { getAuthContext } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/redirect";
import { getAwaProgress } from "@/lib/landing/progress";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const authPrompt =
    params.auth === "required"
      ? { next: safeNextPath(typeof params.next === "string" ? params.next : null) }
      : null;

  // Visiteur sans compte : page de présentation d'Awa, puis la conversation (5 messages d'essai).
  // Page privée demandée sans session (authPrompt) : directement la connexion.
  const { user } = await getAuthContext();
  if (!user && !authPrompt) return <GuestHome progress={await getAwaProgress()} />;

  return <ChatView key="accueil" conversationId={null} initialMessages={[]} authPrompt={authPrompt} />;
}

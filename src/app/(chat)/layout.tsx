import { ChatShell } from "@/components/layout/ChatShell";
import { loadPersonalityCards } from "@/lib/ai/personality-store";
import { getAuthContext } from "@/lib/auth/session";

export default async function ChatLayout({ children }: LayoutProps<"/">) {
  // Les administrateurs ont aussi le chat : c'est là qu'ils apprennent le shimaoré à Awa.
  const { user } = await getAuthContext();

  // Textes du choix de personnalité (modifiables depuis l'admin), seulement s'il est proposé.
  const personalityCards = user ? await loadPersonalityCards() : [];

  return <ChatShell personalityCards={personalityCards}>{children}</ChatShell>;
}

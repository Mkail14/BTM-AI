import { redirect } from "next/navigation";
import { ChatShell } from "@/components/layout/ChatShell";
import { loadPersonalityCards } from "@/lib/ai/personality-store";
import { getAuthContext } from "@/lib/auth/session";

export default async function ChatLayout({ children }: LayoutProps<"/">) {
  // Le compte administrateur pilote la plateforme : il n'a pas d'espace de
  // conversation et arrive directement sur le tableau de bord.
  const { user } = await getAuthContext();
  if (user?.isAdmin) redirect("/admin");

  // Textes du choix de personnalité (modifiables depuis l'admin), seulement s'il est proposé.
  const personalityCards = user ? await loadPersonalityCards() : [];

  return <ChatShell personalityCards={personalityCards}>{children}</ChatShell>;
}

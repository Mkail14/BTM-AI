import Link from "next/link";
import { ChatShell } from "@/components/layout/ChatShell";
import { loadPersonalityCards } from "@/lib/ai/personality-store";
import { getAuthContext } from "@/lib/auth/session";
import { getSiteFlags } from "@/lib/site/settings";

export default async function ChatLayout({ children }: LayoutProps<"/">) {
  // Les administrateurs ont aussi le chat : c'est là qu'ils apprennent le shimaoré à Awa.
  const { user } = await getAuthContext();

  // Textes du choix de personnalité (modifiables depuis l'admin), seulement s'il est proposé.
  const [personalityCards, flags] = await Promise.all([user ? loadPersonalityCards() : [], user?.isAdmin ? getSiteFlags() : null]);

  return (
    <>
      {/* Rappel pour les administrateurs : ce qu'ils voient n'est pas le site public. */}
      {flags?.demoMode || flags?.maintenance ? (
        <Link
          href={user?.isPrincipalAdmin ? "/admin/profil" : "/admin"}
          className="fixed top-2 left-1/2 z-50 -translate-x-1/2 rounded-full bg-warning px-3 py-1 text-[11px] font-semibold text-white shadow-md hover:brightness-110"
        >
          {[flags.demoMode ? "Mode démo" : null, flags.maintenance ? "Maintenance" : null].filter(Boolean).join(" · ")}
        </Link>
      ) : null}
      <ChatShell personalityCards={personalityCards}>{children}</ChatShell>
    </>
  );
}

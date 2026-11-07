import { ChatViewLazy as ChatView } from "@/components/chat/ChatViewLazy";
import { GuestHome } from "@/components/landing/GuestHome";
import { getAuthContext } from "@/lib/auth/session";
import { safeNextPath } from "@/lib/auth/redirect";
import { listPublishedReviews } from "@/lib/reviews";
import { getAnnouncement } from "@/lib/site/announcement";
import { showsAnnouncement } from "@/lib/site/announcement-rules";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const authPrompt =
    params.auth === "required"
      ? { next: safeNextPath(typeof params.next === "string" ? params.next : null) }
      : null;

  // Visiteur sans compte : page de présentation de Tamilya, puis la conversation (5 messages d'essai).
  // Page privée demandée sans session (authPrompt) : la connexion s'ouvre par-dessus cette même
  // page d'accueil ; la fermer laisse donc l'accueil, comme une visite directe de « / ».
  const { user } = await getAuthContext();
  if (!user) {
    const [reviews, announcement] = await Promise.all([listPublishedReviews(), getAnnouncement()]);
    return (
      <GuestHome
        reviews={reviews}
        announcement={announcement && showsAnnouncement(announcement) ? announcement : null}
        authPrompt={authPrompt}
      />
    );
  }

  return <ChatView key="accueil" conversationId={null} initialMessages={[]} authPrompt={authPrompt} />;
}

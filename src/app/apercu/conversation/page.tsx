import type { Metadata } from "next";
import { ConversationPreview } from "@/components/landing/ConversationPreview";

export const metadata: Metadata = { title: "Aperçu de la conversation", robots: { index: false, follow: false } };

/**
 * Page affichée dans le téléphone de l'accueil (ChatDemo) : la page de conversation,
 * faite avec ses vraies pièces, où une conversation d'exemple se déroule toute seule.
 * Elle n'a pas d'autre usage : rien n'y est cliquable.
 */
export default function ConversationPreviewPage() {
  return <ConversationPreview />;
}

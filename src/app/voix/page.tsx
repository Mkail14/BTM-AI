import type { Metadata } from "next";
import { VoiceRoom } from "@/components/chat/VoiceRoom";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Parler à Awa", robots: { index: false, follow: false } };

/** Le maître d'Awa et le globe, rien d'autre : il lui parle, elle répond et retient. */
export default async function VoicePage() {
  await requireAdmin("/voix");
  return <VoiceRoom />;
}

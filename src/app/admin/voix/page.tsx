import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { PageIntro } from "@/components/admin/form";
import { loadVoice } from "@/lib/ai/voice/settings";
import { requireAdmin } from "@/lib/auth/session";
import { VoicePicker } from "./VoicePicker";

export const metadata: Metadata = { title: "Voix de Tamilya", robots: { index: false, follow: false } };

/** Écouter les voix Gemini et choisir celle de Tamilya. */
export default async function AdminVoicePage() {
  const { user } = await requireAdmin("/admin/voix");
  const voice = await loadVoice();

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Voix de Tamilya" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        <PageIntro title="Voix de Tamilya">
          Écoute les voix, puis choisis celle de Tamilya. Elles passent par ta clé Gemini, sans autre abonnement. Si Gemini ne
          répond pas, Tamilya reprend la voix du navigateur.
        </PageIntro>
        <VoicePicker saved={voice} />
      </main>
    </div>
  );
}

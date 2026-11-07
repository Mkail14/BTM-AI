import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { requireAdmin } from "@/lib/auth/session";
import { SongTester } from "./SongTester";

export const metadata: Metadata = { title: "Chansons de Tamilya", robots: { index: false, follow: false } };

/** Essai des chansons (Lyria, Google) : voix chantée et instruments, avant de les donner à Tamilya. */
export default async function AdminMusicPage() {
  const { user } = await requireAdmin("/admin/musique");
  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Chansons" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        <SongTester />
      </main>
    </div>
  );
}

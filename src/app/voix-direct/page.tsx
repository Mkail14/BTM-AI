import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/session";
import { LiveVoice } from "./LiveVoice";

export const metadata: Metadata = { title: "Vocal en direct", robots: { index: false, follow: false } };

/** Essai du vocal en direct (Gemini Live par le relais Cloudflare), réservé aux administrateurs. */
export default async function LiveVoicePage() {
  await requireAdmin("/voix-direct");
  return (
    <main id="contenu" className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 bg-bg p-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]">
      <h1 className="text-center text-2xl font-semibold tracking-tight">Tamilya en direct</h1>
      <LiveVoice />
    </main>
  );
}

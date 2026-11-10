import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { SettingsFrame } from "../parametres/SettingsFrame";
import { BooksView } from "./BooksView";

export const metadata: Metadata = { title: "Mes livres" };

export default async function BooksPage() {
  const { user } = await requireUser("/livres");
  return (
    <SettingsFrame isAdmin={user.isAdmin} section="Mes livres">
      {user.isAdmin ? (
        <BooksView />
      ) : (
        // Même règle que /api/lecture : la lecture en 3D est encore en essai.
        <p className="rounded-2xl border border-border bg-bg px-4 py-6 text-center text-sm text-fg-muted">Tamilya pourra bientôt te lire tes livres en entier.</p>
      )}
    </SettingsFrame>
  );
}

import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning, PageIntro } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { listDocuments } from "@/lib/library/store";
import { LibraryManager } from "./LibraryManager";

export const metadata: Metadata = { title: "Bibliothèque Mayotte", robots: { index: false, follow: false } };

/** Documents de Tamilya sur Mayotte : rien ne sert tant qu'un administrateur ne l'a pas publié. */
export default async function AdminLibraryPage() {
  const { user } = await requireAdmin("/admin/bibliotheque");
  const documents = await listDocuments();

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Bibliothèque Mayotte" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        <PageIntro title="Bibliothèque Mayotte">
          Ajoute des pages officielles, des articles ou des textes. Tamilya les retrouve par le sens et cite leur source, une fois que tu
          les as publiés.
        </PageIntro>
        {documents ? <LibraryManager documents={documents} /> : <MigrationWarning file="20261129000000_bibliotheque_mayotte.sql" />}
      </main>
    </div>
  );
}

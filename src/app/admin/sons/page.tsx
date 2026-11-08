import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { PageIntro } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { BUILTIN_CATALOG, mergeCatalog } from "@/lib/lecture/catalog";
import { readStoredCatalog } from "@/lib/lecture/catalog-store";
import { SoundManager } from "./SoundManager";

export const metadata: Metadata = { title: "Sons de Tamilya", robots: { index: false, follow: false } };

/** Tous les sons des histoires : les écouter, les brancher ou débrancher, les modifier, en ajouter. */
export default async function AdminSoundsPage() {
  const { user } = await requireAdmin("/admin/sons");
  let catalog = BUILTIN_CATALOG;
  let error: string | null = null;
  try {
    catalog = mergeCatalog(await readStoredCatalog());
  } catch (e) {
    error = e instanceof Error ? e.message : "Stockage illisible.";
  }

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Sons" email={user.email} />
      <main id="contenu" className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:py-8">
        <PageIntro title="Sons de Tamilya">
          Les décors, bruits et musiques de ses histoires. Elle choisit elle-même parmi les sons branchés, à chaque histoire.
        </PageIntro>
        {error ? (
          <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2 text-sm">
            Les réglages n&apos;ont pas pu être lus ({error}). Les sons d&apos;origine s&apos;affichent ; les changements peuvent échouer.
          </p>
        ) : null}
        <SoundManager catalog={catalog} />
      </main>
    </div>
  );
}

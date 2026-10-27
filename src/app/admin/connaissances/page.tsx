import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning, PageIntro } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { KnowledgeEditor } from "./KnowledgeEditor";
import type { KnowledgeRow } from "./limits";

export const metadata: Metadata = { title: "Connaissances", robots: { index: false, follow: false } };

export default async function AdminKnowledgePage() {
  const { supabase, user } = await requireAdmin("/admin/connaissances");
  const { data, error } = await supabase
    .from("awa_knowledge")
    .select("id, title, content, keywords, is_active")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) console.error("[admin] Connaissances illisibles", error);

  const rows: KnowledgeRow[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    keywords: r.keywords ?? [],
    isActive: r.is_active,
  }));

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Connaissances" email={user.email} />
      <main id="contenu" className="mx-auto w-full max-w-[1600px] flex-1 p-4">
        <PageIntro title="Connaissances">
          Des fiches vérifiées qu&apos;Awa utilise en priorité (démarches, lieux, BTM…). Pour chaque message, elle reçoit
          les fiches dont un mot-clé ou un mot du titre apparaît dans la question, dans la limite de 6 000 caractères.
        </PageIntro>
        {error ? <MigrationWarning file="20261029000000_awa_brain.sql" /> : null}
        <div className="mt-4">
          <KnowledgeEditor rows={rows} />
        </div>
      </main>
    </div>
  );
}

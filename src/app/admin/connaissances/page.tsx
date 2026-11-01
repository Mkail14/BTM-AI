import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { getMayotteJobs } from "@/lib/live/jobs";
import { getMayotteNews } from "@/lib/live/news";
import { KnowledgeEditor } from "./KnowledgeEditor";
import type { KnowledgeRow } from "./limits";
import { LiveSources } from "./LiveSources";

export const metadata: Metadata = { title: "Connaissances", robots: { index: false, follow: false } };

export default async function AdminKnowledgePage() {
  const { supabase, user } = await requireAdmin("/admin/connaissances");
  const [{ data, error }, jobs, news] = await Promise.all([
    supabase
      .from("awa_knowledge")
      .select("id, title, content, keywords, is_active")
      .order("updated_at", { ascending: false })
      .limit(500),
    getMayotteJobs(),
    getMayotteNews(),
  ]);
  if (error) console.error("[admin] Connaissances illisibles", error);

  const rows: KnowledgeRow[] = (data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    keywords: r.keywords ?? [],
    isActive: r.is_active,
  }));

  return (
    // Un seul écran sur ordinateur : les fiches à gauche, le direct à droite ; seuls leurs contenus défilent.
    <div className="flex min-h-dvh flex-col bg-bg-subtle lg:h-dvh lg:overflow-hidden">
      <AdminHeader section="Connaissances" email={user.email} />
      <main
        id="contenu"
        className="mx-auto grid grid-cols-1 w-full max-w-[1600px] min-h-0 flex-1 gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1fr)_24rem] lg:grid-rows-[minmax(0,1fr)]"
      >
        <div className="flex h-[80dvh] min-h-0 flex-col gap-3 lg:h-auto">
          {error ? <MigrationWarning file="20261029000000_awa_brain.sql" /> : null}
          <KnowledgeEditor rows={rows} />
        </div>
        <LiveSources jobs={jobs} news={news} />
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning, PageIntro } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { LexiconEditor } from "./LexiconEditor";
import type { LexiconRow } from "./limits";

export const metadata: Metadata = { title: "Lexique shimaoré", robots: { index: false, follow: false } };

export default async function AdminLexiconPage() {
  const { supabase, user } = await requireAdmin("/admin/lexique");
  const { data, error } = await supabase
    .from("awa_lexicon")
    .select("id, french, shimaore, context, validated_by, validated_at, is_active")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) console.error("[admin] Lexique illisible", error);

  const rows: LexiconRow[] = (data ?? []).map((r) => ({
    id: r.id,
    french: r.french,
    shimaore: r.shimaore,
    context: r.context ?? "",
    validatedBy: r.validated_by,
    validatedAt: r.validated_at,
    isActive: r.is_active,
  }));

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Lexique shimaoré" email={user.email} />
      <main id="contenu" className="mx-auto w-full max-w-[1600px] flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <PageIntro title="Lexique shimaoré">
          Des expressions relues par un locuteur. Awa s&apos;en sert comme exemples quand elle parle shimaoré ; sans
          entrée active, elle utilise les exemples intégrés au code.
        </PageIntro>
        {error ? <MigrationWarning file="20261029000000_awa_brain.sql" /> : null}
        <div className="mt-4">
          <LexiconEditor rows={rows} />
        </div>
      </main>
    </div>
  );
}

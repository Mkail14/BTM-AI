import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning, PageIntro } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { LexiconEditor } from "./LexiconEditor";
import type { LexiconRow, WordRow } from "./limits";
import { WordsPanel } from "./WordsPanel";

export const metadata: Metadata = { title: "Lexique shimaoré", robots: { index: false, follow: false } };

export default async function AdminLexiconPage() {
  const { supabase, user } = await requireAdmin("/admin/lexique");
  const [lexicon, words] = await Promise.all([
    supabase
      .from("awa_lexicon")
      .select("id, french, shimaore, context, validated_by, validated_at, is_active")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("awa_words")
      .select("id, french, shimaore, category, is_active")
      .order("french")
      .limit(5000),
  ]);
  if (lexicon.error) console.error("[admin] Lexique illisible", lexicon.error);
  if (words.error) console.error("[admin] Dictionnaire illisible", words.error);

  const rows: LexiconRow[] = (lexicon.data ?? []).map((r) => ({
    id: r.id,
    french: r.french,
    shimaore: r.shimaore,
    context: r.context ?? "",
    validatedBy: r.validated_by,
    validatedAt: r.validated_at,
    isActive: r.is_active,
  }));
  const wordRows: WordRow[] = (words.data ?? []).map((r) => ({
    id: r.id,
    french: r.french,
    shimaore: r.shimaore,
    category: r.category ?? "",
    isActive: r.is_active,
  }));

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Lexique shimaoré" email={user.email} />
      <main id="contenu" className="mx-auto w-full max-w-[1600px] flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <PageIntro title="Lexique shimaoré">
          Des expressions relues par un locuteur, et un dictionnaire de mots. Awa s&apos;en sert quand elle parle
          shimaoré ; sans expression active, elle utilise les exemples intégrés au code.
        </PageIntro>
        {lexicon.error ? <MigrationWarning file="20261029000000_awa_brain.sql" /> : null}
        <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]">
          <LexiconEditor rows={rows} />
          <WordsPanel rows={wordRows} unavailable={Boolean(words.error)} />
        </div>
      </main>
    </div>
  );
}

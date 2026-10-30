import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning, PageIntro } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { LexiconEditor } from "./LexiconEditor";
import { readVariants } from "@/lib/ai/brain";
import { PERSONALITY_IDS } from "@/lib/ai/personalities";
import type { LexiconRow, LexiconVariants, WordRequestRow, WordRow } from "./limits";
import { WordRequests } from "./WordRequests";
import { WordsPanel } from "./WordsPanel";

export const metadata: Metadata = { title: "Lexique shimaoré", robots: { index: false, follow: false } };

/** Les trois façons de dire l'expression ; une ancienne entrée (sans versions) passe en « professionnelle ». */
function toVariants(shimaore: string, stored: unknown): LexiconVariants {
  const saved = readVariants(stored);
  const variants = Object.fromEntries(PERSONALITY_IDS.map((id) => [id, saved[id] ?? ""])) as LexiconVariants;
  if (!Object.values(variants).some(Boolean)) variants.professionnelle = shimaore;
  return variants;
}

export default async function AdminLexiconPage() {
  const { supabase, user } = await requireAdmin("/admin/lexique");
  const [lexicon, words, requests] = await Promise.all([
    supabase
      .from("awa_lexicon")
      // « * » : la colonne variants peut ne pas exister encore (migration lexicon_variants).
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase
      .from("awa_words")
      .select("id, french, shimaore, category, is_active")
      .order("french")
      .limit(5000),
    supabase
      .from("awa_word_requests")
      .select("id, shimaore, example, occurrences, last_seen_at")
      .eq("status", "pending")
      .order("last_seen_at", { ascending: false })
      .limit(200),
  ]);
  if (lexicon.error) console.error("[admin] Lexique illisible", lexicon.error);
  if (words.error) console.error("[admin] Dictionnaire illisible", words.error);
  if (requests.error) console.error("[admin] Mots à traduire illisibles", requests.error);

  const rows: LexiconRow[] = (lexicon.data ?? []).map((r) => ({
    id: r.id,
    french: r.french,
    variants: toVariants(r.shimaore, r.variants),
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

  const requestRows: WordRequestRow[] = (requests.data ?? []).map((r) => ({
    id: r.id,
    shimaore: r.shimaore,
    example: r.example ?? "",
    occurrences: r.occurrences,
    lastSeenAt: r.last_seen_at,
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
        <div className="mt-4 empty:hidden">
          <WordRequests rows={requestRows} unavailable={Boolean(requests.error)} />
        </div>
        <div className="mt-4 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,30rem)]">
          <LexiconEditor rows={rows} />
          <WordsPanel rows={wordRows} unavailable={Boolean(words.error)} />
        </div>
      </main>
    </div>
  );
}

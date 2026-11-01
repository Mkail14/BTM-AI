import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { MigrationWarning } from "@/components/admin/form";
import { requireAdmin } from "@/lib/auth/session";
import { LexiconEditor } from "./LexiconEditor";
import { LexiconMap } from "./LexiconMap";
import { LexiconTabs } from "./LexiconTabs";
import { buildLexiconTree } from "@/lib/language/curriculum";
import { sortNewWords } from "@/lib/language/sort-words";
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

  // Mots actifs du dictionnaire et expressions actives : ce qu'Awa sait déjà dire.
  // Les mots appris sans place (conversation, traduction, liste…) sont rangés par Gemini avant l'affichage.
  const activeWords = wordRows.filter((w) => w.isActive);
  const sorted = await sortNewWords(supabase, activeWords).catch((error: unknown) => {
    console.error("[admin] Rangement des mots impossible", error);
    return new Map<string, string>();
  });
  for (const word of wordRows) word.category = sorted.get(word.id) ?? word.category;
  const tree = buildLexiconTree([
    ...activeWords,
    ...rows.filter((r) => r.isActive).map((r) => ({ french: r.french, shimaore: Object.values(r.variants).find(Boolean) ?? "" })),
  ]);

  const requestRows: WordRequestRow[] = (requests.data ?? []).map((r) => ({
    id: r.id,
    shimaore: r.shimaore,
    example: r.example ?? "",
    occurrences: r.occurrences,
    lastSeenAt: r.last_seen_at,
  }));

  return (
    // Un seul écran sur ordinateur : la carte à gauche, les outils à droite ; seuls leurs contenus défilent.
    <div className="flex min-h-dvh flex-col bg-bg-subtle lg:h-dvh lg:overflow-hidden">
      <AdminHeader section="Lexique shimaoré" email={user.email} />
      <main
        id="contenu"
        className="mx-auto grid grid-cols-1 w-full max-w-[1600px] min-h-0 flex-1 gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-[minmax(0,1fr)]"
      >
        <LexiconMap tree={tree} />
        <div className="flex h-[80dvh] min-h-0 flex-col gap-3 lg:h-auto">
          {lexicon.error ? <MigrationWarning file="20261029000000_awa_brain.sql" /> : null}
          <LexiconTabs
            tabs={[
              ...(requestRows.length || requests.error
                ? [
                    {
                      id: "traduire",
                      label: "À traduire",
                      count: requestRows.length,
                      highlight: true,
                      content: <WordRequests rows={requestRows} unavailable={Boolean(requests.error)} />,
                    },
                  ]
                : []),
              {
                id: "dictionnaire",
                label: "Dictionnaire",
                count: wordRows.length,
                content: <WordsPanel rows={wordRows} unavailable={Boolean(words.error)} />,
              },
              { id: "expressions", label: "Expressions", count: rows.length, content: <LexiconEditor rows={rows} /> },
            ]}
          />
        </div>
      </main>
    </div>
  );
}

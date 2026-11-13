import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { PageIntro } from "@/components/admin/form";
import { knownTranslations, loadTamilyaBrain } from "@/lib/ai/brain";
import { listAllAuthUsers } from "@/lib/admin/stats";
import { hasAdminRole } from "@/lib/auth/roles";
import { requireAdmin } from "@/lib/auth/session";
import { findIssues, type LexEntry } from "@/lib/language/cleanup";
import { stillToLearn, weeklyProgress, type ReplySample } from "@/lib/language/progress";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { LexiconTabs } from "../lexique/LexiconTabs";
import { CleanupPanel } from "./CleanupPanel";
import { GrammarPanel } from "./GrammarPanel";
import type { GrammarRow } from "./limits";
import { ProgressPanel, type ProgressTotals } from "./ProgressPanel";

export const metadata: Metadata = { title: "Apprentissage du shimaoré", robots: { index: false, follow: false } };

const WEEKS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Date ISO d'il y a `days` jours. */
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS).toISOString();

/** Réponses de Tamilya aux administrateurs (mode maître : elle leur parle shimaoré), 8 dernières semaines. */
async function masterReplies(): Promise<ReplySample[] | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  // Pages de comptes lues en même temps (et non plus l'une après l'autre).
  const users = await listAllAuthUsers(admin, 10);
  if (!users) return null;
  const adminIds = users.filter((u) => hasAdminRole({ app_metadata: u.app_metadata })).map((u) => u.id);
  if (adminIds.length === 0) return [];
  const { data, error } = await admin
    .from("messages")
    .select("content, created_at")
    .eq("role", "assistant")
    .in("user_id", adminIds)
    .gte("created_at", daysAgo(WEEKS * 7))
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) {
    console.error("[admin] Réponses de Tamilya illisibles", error);
    return null;
  }
  return (data ?? []).map((m) => ({ content: m.content, createdAt: m.created_at }));
}

export default async function AdminLearningPage() {
  const { supabase, user } = await requireAdmin("/admin/apprentissage");
  const weekAgo = daysAgo(7);
  const monthAgo = daysAgo(30);
  const [grammar, words, lexicon, ignored, replies, brain] = await Promise.all([
    supabase.from("awa_grammar").select("id, title, rule, examples, is_active").order("position").order("created_at").limit(100),
    supabase.from("awa_words").select("id, french, shimaore, created_at").limit(10000),
    supabase.from("awa_lexicon").select("id, french, shimaore, created_at").limit(5000),
    supabase.from("awa_cleanup_ignored").select("kind, ref").limit(5000),
    masterReplies(),
    loadTamilyaBrain(),
  ]);
  if (grammar.error) console.error("[admin] Grammaire illisible", grammar.error);

  const grammarRows: GrammarRow[] = (grammar.data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    rule: r.rule,
    examples: r.examples ?? "",
    isActive: r.is_active,
  }));

  const entries: LexEntry[] = [
    ...(words.data ?? []).map((r) => ({ table: "words" as const, id: r.id, french: r.french, shimaore: r.shimaore })),
    ...(lexicon.data ?? []).map((r) => ({ table: "lexicon" as const, id: r.id, french: r.french, shimaore: r.shimaore })),
  ];
  const issues = findIssues(entries, new Set((ignored.data ?? []).map((r) => `${r.kind}|${r.ref}`)));

  const totals: ProgressTotals = {
    words: words.data?.length ?? 0,
    phrases: lexicon.data?.length ?? 0,
    grammar: grammarRows.filter((g) => g.isActive).length,
    learnedThisWeek: [...(words.data ?? []), ...(lexicon.data ?? [])].filter((r) => r.created_at >= weekAgo).length,
  };
  const recent = (replies ?? []).filter((r) => r.createdAt >= monthAgo);

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Apprentissage du shimaoré" email={user.email} />
      <main id="contenu" className="mx-auto w-full max-w-4xl flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <PageIntro title="Apprentissage du shimaoré">
          Ses progrès, la grammaire qu&apos;elle applique et le ménage dans ce qu&apos;elle a appris. Les mots et les
          phrases se gèrent dans le Lexique ; dans le chat, « C&apos;est juste » garde une phrase réussie comme modèle.
        </PageIntro>
        <div className="mt-4">
          <LexiconTabs
            tabs={[
              {
                id: "progres",
                label: "Progrès",
                content: (
                  <ProgressPanel
                    weeks={weeklyProgress(replies ?? [])}
                    toLearn={stillToLearn(recent, knownTranslations(brain))}
                    totals={totals}
                    unavailable={replies === null}
                  />
                ),
              },
              {
                id: "grammaire",
                label: "Grammaire",
                count: grammarRows.length,
                content: <GrammarPanel rows={grammarRows} unavailable={Boolean(grammar.error)} />,
              },
              {
                id: "nettoyage",
                label: "Nettoyage",
                count: issues.length,
                highlight: issues.length > 0,
                content: <CleanupPanel issues={issues} total={entries.length} />,
              },
            ]}
          />
        </div>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { PageIntro } from "@/components/admin/form";
import { requireAdmin } from "@/server/middlewares/session";
import { LexiconTabs } from "../lexique/LexiconTabs";
import { GrammarPanel } from "./GrammarPanel";
import type { GrammarRow, QuestionRow } from "./limits";
import { QuestionsPanel } from "./QuestionsPanel";

export const metadata: Metadata = { title: "Apprentissage du shimaoré", robots: { index: false, follow: false } };

export default async function AdminLearningPage() {
  const { supabase, user } = await requireAdmin("/admin/apprentissage");
  const [grammar, questions] = await Promise.all([
    supabase.from("awa_grammar").select("id, title, rule, examples, is_active").order("position").order("created_at").limit(100),
    supabase
      .from("awa_questions")
      .select("id, phrase, french, question, source, occurrences, last_seen_at")
      .eq("status", "pending")
      .order("last_seen_at", { ascending: false })
      .limit(50),
  ]);
  if (grammar.error) console.error("[admin] Grammaire illisible", grammar.error);
  if (questions.error) console.error("[admin] Questions illisibles", questions.error);

  const questionRows: QuestionRow[] = (questions.data ?? []).map((r) => ({
    id: r.id,
    phrase: r.phrase,
    french: r.french ?? "",
    question: r.question,
    source: r.source === "voix" ? "voix" : "chat",
    occurrences: r.occurrences,
    lastSeenAt: r.last_seen_at,
  }));

  const grammarRows: GrammarRow[] = (grammar.data ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    rule: r.rule,
    examples: r.examples ?? "",
    isActive: r.is_active,
  }));

  return (
    <div className="flex min-h-dvh flex-col bg-bg-subtle">
      <AdminHeader section="Apprentissage du shimaoré" email={user.email} />
      <main id="contenu" className="mx-auto w-full max-w-4xl flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <PageIntro title="Apprentissage du shimaoré">
          Les questions de Tamilya et la grammaire qu&apos;elle applique. Les mots et les phrases se gèrent dans le
          Lexique ; dans le chat, « C&apos;est juste » garde une phrase réussie comme modèle.
        </PageIntro>
        <div className="mt-4">
          <LexiconTabs
            tabs={[
              {
                id: "questions",
                label: "Questions",
                count: questionRows.length,
                highlight: questionRows.length > 0,
                content: <QuestionsPanel rows={questionRows} unavailable={Boolean(questions.error)} />,
              },
              {
                id: "grammaire",
                label: "Grammaire",
                count: grammarRows.length,
                content: <GrammarPanel rows={grammarRows} unavailable={Boolean(grammar.error)} />,
              },
            ]}
          />
        </div>
      </main>
    </div>
  );
}

import "server-only";
import { DOUBT_PROMPT, keepRealDoubts, parseDoubts } from "@/lib/language/doubts";
import { mayContainShimaore } from "@/lib/language/unknown-tag";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { completeText } from "@/server/services/ai/complete";
import type { AIProvider } from "@/lib/ai/types";
import { lexiconFor, wordsFor, type TamilyaBrain } from "@/server/services/ai/brain";

/**
 * Après une réponse (chat ou voix, même chemin) : Tamilya relit son shimaoré et
 * envoie ses doutes dans l'onglet « Questions » de /admin/apprentissage.
 * Appel de fond : il ne retarde jamais la réponse.
 */
export async function collectDoubts(
  provider: AIProvider,
  input: { reply: string; brain: TamilyaBrain; source: "chat" | "voix" },
): Promise<void> {
  const known = [...input.brain.lexicon, ...input.brain.words].map((entry) => entry.shimaore);
  // Pas de shimaoré reconnu dans sa réponse : rien à relire.
  if (!mayContainShimaore(input.reply, known)) return;
  const admin = getSupabaseAdminClient();
  if (!admin) return;

  const rules = input.brain.grammar.map((g) => `- ${g.title} : ${g.rule}`).join("\n");
  // La consigne parle du vocabulaire donné : on le donne vraiment (avant le 2026-11-20, seulement les règles,
  // et elle redemandait des phrases déjà validées).
  const list = (entries: readonly { french: string; shimaore: string }[]) => entries.map((e) => `- ${e.french} → ${e.shimaore}`).join("\n");
  const phrases = lexiconFor(input.brain, input.reply) ?? [];
  const words = wordsFor(input.brain, input.reply).slice(0, 80);
  const output = await completeText(provider, {
    system: DOUBT_PROMPT,
    content: [
      `Règles que tu connais :\n${rules || "(aucune)"}`,
      `Phrases validées par ton maître :\n${list(phrases.slice(0, 60)) || "(aucune)"}`,
      `Vocabulaire validé :\n${list(words) || "(aucun)"}`,
      `Ce que tu as dit :\n${input.reply.slice(0, 1500)}`,
    ].join("\n\n"),
    maxOutputTokens: 400,
  }).catch((error: unknown) => {
    console.error("[tamilya] Relecture du shimaoré impossible", error);
    return "";
  });

  // Le code a le dernier mot : rien de déjà validé ni de français recopié ne part au maître.
  for (const doubt of keepRealDoubts(parseDoubts(output), known)) {
    const { error } = await admin.rpc("report_tamilya_doubt", {
      p_phrase: doubt.phrase,
      p_french: doubt.french,
      p_question: doubt.question,
      p_source: input.source,
    });
    if (error) {
      console.error("[tamilya] Doute non signalé (migration questions_de_tamilya appliquée ?)", error);
      return;
    }
  }
}

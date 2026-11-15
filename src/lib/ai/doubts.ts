import "server-only";
import { DOUBT_PROMPT, parseDoubts } from "@/lib/language/doubts";
import { mayContainShimaore } from "@/lib/language/unknown-tag";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { completeText } from "./complete";
import type { AIProvider } from "./types";
import type { TamilyaBrain } from "./brain";

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
  const output = await completeText(provider, {
    system: DOUBT_PROMPT,
    content: `Règles que tu connais :\n${rules || "(aucune)"}\n\nCe que tu as dit :\n${input.reply.slice(0, 1500)}`,
    maxOutputTokens: 400,
  }).catch((error: unknown) => {
    console.error("[tamilya] Relecture du shimaoré impossible", error);
    return "";
  });

  for (const doubt of parseDoubts(output)) {
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

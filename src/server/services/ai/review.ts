import "server-only";
import { acceptReview, buildReviewContent, REVIEW_PROMPT } from "@/lib/language/review";
import type { ValidatedExample } from "@/lib/language/types";
import { completeText } from "@/server/services/ai/complete";
import type { AIProvider } from "@/lib/ai/types";
import type { GrammarRule } from "@/server/services/ai/brain";
import type { WordEntry } from "@/lib/ai/words";

/**
 * Relit la réponse en shimaoré avant qu'elle soit gardée (chat, mode maître).
 * Lent ou en panne : le brouillon part tel quel, jamais de blocage.
 */
export async function reviewShimaore(
  provider: AIProvider,
  input: { draft: string; grammar: readonly GrammarRule[]; phrases: readonly ValidatedExample[]; words: readonly WordEntry[] },
): Promise<string> {
  try {
    const output = await completeText(provider, {
      system: REVIEW_PROMPT,
      content: buildReviewContent(input),
      maxOutputTokens: Math.min(1500, Math.ceil(input.draft.length / 2) + 300),
      timeoutMs: 8_000,
    });
    return acceptReview(input.draft, output);
  } catch (error) {
    console.error("[tamilya] Relecture du shimaoré impossible", error);
    return input.draft;
  }
}

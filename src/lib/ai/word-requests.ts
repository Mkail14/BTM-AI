import "server-only";
import {
  keepReportableWords,
  MAX_REPORTED_WORDS,
  mayContainShimaore,
  parseSpottedWords,
  SHIMAORE_SPOTTING_PROMPT,
} from "@/lib/language/unknown-tag";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { completeText } from "./complete";
import type { AIProvider } from "./types";

/**
 * Ajoute des mots shimaoré inconnus à la liste « À traduire » de
 * /admin/lexique (ou compte un retour de plus).
 */
export async function reportUnknownWords(words: readonly string[], example: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  if (!admin || words.length === 0) return;
  for (const word of words) {
    const { error } = await admin.rpc("report_unknown_word", { p_shimaore: word, p_example: example.slice(0, 300) });
    if (error) {
      console.error("[awa] Mot inconnu non signalé (migration awa_word_requests appliquée ?)", error);
      return;
    }
  }
}

/**
 * Après la réponse : mots signalés par Awa (balise <<inconnu: …>>) et, si le
 * message semble contenir du shimaoré, relevé par un appel de fond (les petits
 * modèles devinent souvent au lieu de signaler). Seuls les mots écrits par
 * l'utilisateur et absents du dictionnaire partent à l'administrateur.
 */
export async function collectUnknownWords(
  provider: AIProvider,
  input: { message: string; tagged: readonly string[]; known: readonly string[] },
): Promise<void> {
  let candidates = [...input.tagged];
  if (mayContainShimaore(input.message, input.known)) {
    const output = await completeText(provider, {
      system: SHIMAORE_SPOTTING_PROMPT,
      content: input.message.slice(0, 2000),
      maxOutputTokens: 300,
    }).catch((error: unknown) => {
      console.error("[awa] Relevé du shimaoré impossible", error);
      return "";
    });
    candidates = [...candidates, ...parseSpottedWords(output)];
  }
  const unknown = [...new Set(keepReportableWords(candidates, input.message, input.known))].slice(0, MAX_REPORTED_WORDS);
  await reportUnknownWords(unknown, input.message);
}

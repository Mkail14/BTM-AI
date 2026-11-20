import "server-only";
import {
  buildComposeContent,
  COMPOSE_PROMPT,
  findValidated,
  nearestExamples,
  parseComposition,
  unsureWords,
  type Composition,
} from "@/lib/language/compose";
import { lexiconFor, wordsFor, type TamilyaBrain } from "@/server/services/ai/brain";
import { completeText } from "@/server/services/ai/complete";
import type { AIProvider } from "@/lib/ai/types";

/**
 * Prépare « comment on dit … » avant la réponse de Tamilya (voir
 * src/lib/language/compose.ts). Phrase validée : aucun appel au modèle.
 * Sinon un modèle qui réfléchit compose avec le vocabulaire retrouvé ;
 * AI_SHIMAORE_MODEL (ex. un Gemini « pro ») le remplace pour cette tâche.
 * Lent ou en panne : elle dit qu'elle ne sait pas.
 */
export async function composeShimaore(provider: AIProvider, brain: TamilyaBrain, french: string): Promise<Composition> {
  const phrases = lexiconFor(brain, french) ?? [];
  const words = wordsFor(brain, french);
  const known = words.slice(0, 40);
  // Modèles de construction : les phrases validées (expressions et phrases du dictionnaire) les plus proches.
  const nearest = nearestExamples([...brain.words, ...brain.lexicon], french, 20);
  const validated = findValidated([...brain.words, ...brain.lexicon], french);
  if (validated) return { french, shimaore: validated.shimaore, validated: true, unsure: [], known };

  // Le moteur en panne ne rend pas la parole libre au modèle : « je ne sais pas » (« Wam Tsa Claude… »
  // inventé le 2026-11-16 pendant que la composition dépassait son délai).
  const unknown: Composition = { french, shimaore: "", validated: false, unsure: [], known };
  try {
    // Sans réflexion approfondie : elle dépassait 30 s à chaque fois. La sûreté vient de la vérification du code.
    const output = await completeText(provider, {
      system: COMPOSE_PROMPT,
      content: buildComposeContent({ french, nearest, phrases: phrases.slice(0, 60), words: words.slice(0, 120), grammar: brain.grammar }),
      maxOutputTokens: 1500,
      timeoutMs: 20_000,
      model: process.env.AI_SHIMAORE_MODEL?.trim() || undefined,
    });
    const shimaore = parseComposition(output);
    if (shimaore === null) {
      console.error("[tamilya] Composition du shimaoré illisible", output.slice(0, 200));
      return unknown;
    }
    return { french, shimaore, validated: false, unsure: unsureWords(shimaore, [...nearest, ...phrases, ...words], french), known };
  } catch (error) {
    console.error("[tamilya] Composition du shimaoré impossible", error);
    return unknown;
  }
}

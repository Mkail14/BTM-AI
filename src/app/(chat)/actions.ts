"use server";

import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { getAIProvider } from "@/lib/ai";
import { invalidateAwaBrain, loadAwaBrain, wordsFor } from "@/lib/ai/brain";
import { completeText } from "@/lib/ai/complete";
import { teachWords } from "@/lib/ai/words-store";
import { TAUGHT_WORD_MAX } from "@/lib/language/teaching";

const PHRASE_MAX = 200; // contrainte de awa_lexicon

const schema = z.object({
  french: z.string().trim().min(1).max(PHRASE_MAX, "Phrase trop longue pour être apprise d'un coup."),
  shimaore: z.string().trim().min(1, "Écris la traduction.").max(PHRASE_MAX, "Traduction trop longue."),
});

/**
 * Clic sur un [[mot]] orange dans le chat : le maître donne la traduction,
 * Awa la garde pour toujours. Mot ou phrase courte → dictionnaire (la nouvelle
 * traduction remplace l'ancienne) ; phrase plus longue → expressions.
 */
export async function teachUnknownWordAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { french, shimaore } = parsed.data;

  try {
    if (french.length <= TAUGHT_WORD_MAX && shimaore.length <= TAUGHT_WORD_MAX) {
      await teachWords(auth.supabase, auth.user.id, [{ french, shimaore }]);
    } else {
      const { error } = await auth.supabase.from("awa_lexicon").insert({
        french,
        shimaore,
        validated_by: auth.user.email ?? "Maître d'Awa",
      });
      if (error) throw error;
    }
  } catch (error) {
    console.error("[chat] Traduction non enregistrée", error);
    return { ok: false, message: "Pas enregistré, réessaie." };
  }
  invalidateAwaBrain();
  return { ok: true, message: `${french} → ${shimaore}` };
}

const CONTEXT_MAX = 120; // contrainte de awa_lexicon.context

const correctionSchema = z.object({
  shimaore: z.string().trim().min(1, "Écris la bonne façon de le dire.").max(PHRASE_MAX, "Correction trop longue."),
  french: z.string().trim().min(1, "Écris ce que ça veut dire en français.").max(PHRASE_MAX, "Sens trop long."),
  context: z.string().trim().max(CONTEXT_MAX, `Contexte limité à ${CONTEXT_MAX} caractères.`),
});

/**
 * Sélection d'un passage dans une réponse d'Awa : le maître le corrige, même
 * si Awa croit le connaître. Avec un contexte (« à un aîné », « au marché »…),
 * la correction s'ajoute aux expressions sans remplacer la traduction
 * générale : Awa choisit selon la situation. Sans contexte, elle remplace
 * la traduction du mot partout.
 */
export async function correctInContextAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const parsed = correctionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };
  const { french, shimaore, context } = parsed.data;

  try {
    if (!context && french.length <= TAUGHT_WORD_MAX && shimaore.length <= TAUGHT_WORD_MAX) {
      await teachWords(auth.supabase, auth.user.id, [{ french, shimaore }]);
    } else {
      const { error } = await auth.supabase.from("awa_lexicon").insert({
        french,
        shimaore,
        context: context || null,
        validated_by: auth.user.email ?? "Maître d'Awa",
      });
      if (error) throw error;
    }
  } catch (error) {
    console.error("[chat] Correction non enregistrée", error);
    return { ok: false, message: "Pas enregistré, réessaie." };
  }
  invalidateAwaBrain();
  return { ok: true, message: context ? `Retenu : « ${shimaore} » ${context}.` : `Retenu : « ${shimaore} » = ${french}.` };
}

const guessSchema = z.object({
  shimaore: z.string().trim().min(1).max(PHRASE_MAX),
  wrote: z.string().trim().max(PHRASE_MAX),
  message: z.string().trim().max(2000),
  question: z.string().trim().max(1000).default(""),
});

/*
 * Awa apprend encore le shimaoré : le passage peut être faux ou inventé. On
 * demande donc ce qu'elle VOULAIT dire (d'après la question et le reste de sa
 * réponse), pas une traduction mot à mot.
 */
const GUESS_PROMPT = `Awa est une assistante qui apprend le shimaoré (langue de Mayotte). Dans sa réponse, elle a essayé de dire quelque chose en shimaoré, parfois avec des erreurs ou des mots approximatifs.
Ta tâche : dire en français ce qu'Awa voulait exprimer avec le passage indiqué. Appuie-toi sur la question de l'utilisateur, le reste de sa réponse et le vocabulaire connu ; ne traduis pas mot à mot si le sens du contexte est plus clair.
Réponds uniquement par cette phrase en français, courte et naturelle, sans guillemets ni explication.
Si c'est vraiment impossible à deviner, réponds seulement « ? ».`;

const normalize = (text: string) => text.toLowerCase().replace(/[«»"“”.,!?;:]/g, "").replace(/\s+/g, " ").trim();

/**
 * Le maître ne connaît pas toujours le sens en français de ce qu'il corrige :
 * Awa le propose, d'après son lexique si le passage y est, sinon par l'IA
 * à partir de la phrase où il apparaît. Le maître peut toujours le modifier.
 */
export async function guessFrenchAction(
  input: unknown,
): Promise<{ ok: true; french: string; fromLexicon: boolean } | { ok: false; message: string }> {
  const auth = await requireAdminAction();
  if (!auth) return { ok: false, message: NOT_ADMIN.message };
  const parsed = guessSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Écris d'abord la bonne façon de le dire." };
  const { shimaore, wrote, message, question } = parsed.data;

  const brain = await loadAwaBrain();
  const entries = [...brain.lexicon, ...brain.words];
  for (const candidate of [shimaore, wrote].map(normalize).filter(Boolean)) {
    const known = entries.find((entry) => normalize(entry.shimaore) === candidate);
    if (known) return { ok: true, french: known.french, fromLexicon: true };
  }

  const ai = await getAIProvider();
  if (!ai.ok) return { ok: false, message: "Awa ne peut pas deviner pour l'instant : écris le sens toi-même." };
  // Vocabulaire déjà validé : l'IA s'appuie dessus plutôt que de deviner au hasard.
  const vocabulary = wordsFor(brain, `${question} ${shimaore} ${message}`, true)
    .slice(0, 80)
    .map((word) => `${word.shimaore} = ${word.french}`)
    .join("\n");
  const output = await completeText(ai.provider, {
    system: vocabulary ? `${GUESS_PROMPT}\n\nVocabulaire connu (shimaoré = français) :\n${vocabulary}` : GUESS_PROMPT,
    content: [
      question ? `Message de l'utilisateur : ${question}` : "",
      message ? `Réponse complète d'Awa : ${message}` : "",
      `Passage dont il faut donner le sens en français : ${shimaore}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
    maxOutputTokens: 120,
    timeoutMs: 20_000,
  }).catch((error: unknown) => {
    console.error("[chat] Sens en français non deviné", error);
    return "";
  });
  const french = (output.split("\n").find((line) => line.trim()) ?? "")
    .replace(/^[\s«"“]+|[\s»"”]+$/g, "")
    .slice(0, PHRASE_MAX);
  if (!french || french === "?") return { ok: false, message: "Awa n'a pas trouvé : écris le sens toi-même." };
  return { ok: true, french, fromLexicon: false };
}

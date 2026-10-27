"use server";

import { revalidatePath } from "next/cache";
import { getAIProvider } from "@/lib/ai";
import { lexiconFor, loadAwaBrain, wordsFor } from "@/lib/ai/brain";
import { composePersonalityInstructions, isPersonalityId, parseBehavior } from "@/lib/ai/personalities";
import { savePersonalityBehavior } from "@/lib/ai/personality-store";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import { getAuthContext } from "@/lib/auth/session";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const TEST_MESSAGE_MAX = 1000;
const TEST_MAX_TOKENS = 700;
const TEST_TIMEOUT_MS = 45_000;

/** Les actions s'autorisent elles-mêmes : session relue, rôle revérifié (RLS aussi). */
async function requireAdminAction() {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user?.isAdmin) return null;
  return { supabase, user };
}

/** Enregistre le comportement (ou null pour revenir aux réglages d'origine). */
export async function savePersonalityAction(id: unknown, behavior: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return { ok: false, message: "Accès réservé aux administrateurs." };
  if (!isPersonalityId(id)) return { ok: false, message: "Personnalité inconnue." };

  const parsed = behavior === null ? null : parseBehavior(behavior);
  if (behavior !== null && !parsed) return { ok: false, message: "Données invalides." };
  if (parsed && !parsed.attitude) return { ok: false, message: "Décrivez au moins son attitude." };

  try {
    await savePersonalityBehavior(auth.supabase, id, parsed, auth.user.id);
  } catch (error) {
    console.error("[admin] Enregistrement de la personnalité impossible", error);
    return { ok: false, message: "L'enregistrement a échoué. Réessayez." };
  }

  revalidatePath("/admin/personnalites");
  return {
    ok: true,
    message: parsed ? "Enregistré. Awa l'applique dans la minute." : "Réglages d'origine rétablis.",
  };
}

/**
 * Essai du brouillon (même non enregistré) : une réponse d'Awa à un message,
 * avec le même message système que le chat (cerveau compris, sans mémoire).
 */
export async function testPersonalityAction(id: unknown, behavior: unknown, message: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return { ok: false, message: "Accès réservé aux administrateurs." };
  if (!isPersonalityId(id)) return { ok: false, message: "Personnalité inconnue." };
  const parsed = parseBehavior(behavior);
  if (!parsed) return { ok: false, message: "Données invalides." };
  const text = typeof message === "string" ? message.trim() : "";
  if (!text) return { ok: false, message: "Écrivez un message à envoyer." };
  if (text.length > TEST_MESSAGE_MAX) return { ok: false, message: `${TEST_MESSAGE_MAX} caractères maximum.` };

  const ai = await getAIProvider();
  if (!ai.ok) return { ok: false, message: `Service d'IA non configuré : ${ai.reason}` };

  const brain = await loadAwaBrain();
  const system = buildSystemPrompt(id, {
    name: brain.name,
    identity: brain.identity,
    rules: brain.rules,
    lexicon: lexiconFor(brain, id),
    words: wordsFor(brain, text),
    personalityInstructions: composePersonalityInstructions(id, parsed),
  });

  let reply = "";
  try {
    for await (const chunk of ai.provider.stream({
      system,
      messages: [{ role: "user", content: text }],
      maxOutputTokens: Math.min(ai.config.maxOutputTokens, TEST_MAX_TOKENS),
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })) {
      if (chunk.type === "text") reply += chunk.text;
    }
  } catch (error) {
    console.error("[admin] Essai de personnalité impossible", error);
    return { ok: false, message: "Awa n'a pas pu répondre (fournisseur d'IA indisponible ou trop lent)." };
  }

  return reply.trim() ? { ok: true, message: reply.trim() } : { ok: false, message: "Réponse vide." };
}

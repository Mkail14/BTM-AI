import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Consommation des API d'IA (jetons envoyés et reçus, chiffres donnés par
 * l'API), pour la barre « Crédit Google » du tableau de bord.
 */

/** Tarifs Gemini en dollars par million de jetons (réflexion comptée en sortie). Estimation. */
const GEMINI_PRICES: { match: RegExp; input: number; output: number }[] = [
  { match: /flash-lite/, input: 0.1, output: 0.4 },
  { match: /flash/, input: 0.5, output: 3 },
  { match: /pro/, input: 2, output: 12 },
];
const USD_TO_EUR = 0.92;

/** Crédit Google payé, en euros (GEMINI_BUDGET_EUR, 25 € par défaut). */
export function geminiBudgetEur(env: Record<string, string | undefined> = process.env): number {
  const value = Number(env.GEMINI_BUDGET_EUR);
  return Number.isFinite(value) && value > 0 ? value : 25;
}

/** Coût estimé en euros d'un volume de jetons d'un modèle Gemini (0 pour un autre modèle). */
export function geminiCostEur(model: string, inputTokens: number, outputTokens: number): number {
  if (!model.startsWith("gemini")) return 0;
  const price = GEMINI_PRICES.find((p) => p.match.test(model)) ?? GEMINI_PRICES[1];
  return ((inputTokens * price.input + outputTokens * price.output) / 1_000_000) * USD_TO_EUR;
}

/** Enregistre la consommation d'une réponse, après l'envoi (ne retarde jamais la réponse). */
export function recordAiUsage(model: string, inputTokens: number, outputTokens: number): void {
  const admin = getSupabaseAdminClient();
  if (!admin || inputTokens + outputTokens <= 0) return;
  const task = async () => {
    const { error } = await admin.rpc("record_ai_usage", { p_model: model, p_input: inputTokens, p_output: outputTokens });
    if (error) console.error("[ai] Consommation non enregistrée (migration ai_usage appliquée ?)", error);
  };
  try {
    after(task);
  } catch {
    // Hors requête (tests, tâches de fond) : enregistrement sans attente.
    void task();
  }
}

export type GeminiSpend = { spentEur: number; budgetEur: number; requests: number; today: number };

/** Dépense Gemini estimée depuis le début du suivi ; null si la table n'existe pas encore. */
export async function getGeminiSpend(admin: SupabaseClient): Promise<GeminiSpend | null> {
  const { data, error } = await admin
    .from("ai_usage")
    .select("day, model, requests, input_tokens, output_tokens")
    .like("model", "gemini%")
    .limit(5000);
  if (error) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Indian/Mayotte" }).format(new Date());
  let spentEur = 0;
  let requests = 0;
  let todayEur = 0;
  for (const row of data ?? []) {
    const cost = geminiCostEur(row.model, Number(row.input_tokens), Number(row.output_tokens));
    spentEur += cost;
    requests += Number(row.requests);
    if (row.day === today) todayEur += cost;
  }
  return { spentEur, budgetEur: geminiBudgetEur(), requests, today: todayEur };
}

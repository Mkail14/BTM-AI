"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { NOT_ADMIN, requireAdminAction, type ActionResult } from "@/lib/admin/action-auth";
import { createProvider, slotHealthId } from "@/lib/ai";
import { AI_PROVIDERS } from "@/lib/ai/config";
import { recordFailure, recordSuccess } from "@/lib/ai/health";
import { checkKey } from "@/lib/ai/key-check";
import { invalidateAIChain, loadAIChain, storedSlot } from "@/lib/ai/registry";
import { canEncrypt, encryptSecret } from "@/lib/ai/secret-box";
import { AIProviderError } from "@/lib/ai/types";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { API_LIMITS } from "./presets";

export type SlotTestResult = { ok: boolean; message: string; latencyMs: number | null };

const TEST_MAX_TOKENS = 64;
const TEST_TIMEOUT_MS = 30_000;

/**
 * Envoie un vrai petit message à une seule API de la chaîne (sans secours)
 * pour savoir si elle répond. Coûte quelques tokens.
 */
export async function testSlotAction(slotId: unknown): Promise<SlotTestResult> {
  if (!(await requireAdminAction())) return { ...NOT_ADMIN, latencyMs: null };

  const entry = (await loadAIChain()).find((s) => s.id === slotId);
  if (!entry) return { ok: false, message: "API inconnue.", latencyMs: null };
  if (!entry.result.ok) return { ok: false, message: entry.result.reason, latencyMs: null };

  const { config } = entry.result;
  const healthId = slotHealthId(entry.id, config);
  const startedAt = Date.now();
  let reply = "";
  try {
    for await (const chunk of createProvider(config).stream({
      system: "Tu es un test de connexion. Réponds uniquement : OK",
      messages: [{ role: "user", content: "Test" }],
      maxOutputTokens: TEST_MAX_TOKENS,
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })) {
      if (chunk.type === "text") reply += chunk.text;
    }
  } catch (error) {
    const code = error instanceof AIProviderError ? error.code : "unavailable";
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    recordFailure(healthId, code === "aborted" ? "timeout" : code, message);
    console.error(`[admin] Essai de l'API ${entry.id} impossible`, error);
    return { ok: false, message, latencyMs: null };
  }

  const latencyMs = Date.now() - startedAt;
  recordSuccess(healthId, latencyMs);
  return {
    ok: true,
    message: reply.trim() ? `Réponse : « ${reply.trim().slice(0, 80)} »` : "Réponse reçue (vide).",
    latencyMs,
  };
}

const newApiSchema = z.object({
  label: z.string().trim().min(1, "Donnez un nom à cette API.").max(API_LIMITS.label),
  provider: z.enum(AI_PROVIDERS),
  baseUrl: z
    .string()
    .trim()
    .max(API_LIMITS.baseUrl)
    .refine((v) => v === "" || /^https?:\/\/\S+$/.test(v), "Adresse invalide (https://…)."),
  model: z.string().trim().min(1, "Indiquez le modèle.").max(API_LIMITS.model),
  apiKey: z.string().trim().min(8, "Collez la clé API.").max(API_LIMITS.apiKey),
});

/** Ajoute une API en fin de chaîne, après avoir vérifié sa clé auprès du fournisseur. */
export async function addApiAction(input: unknown): Promise<ActionResult> {
  const auth = await requireAdminAction();
  if (!auth) return NOT_ADMIN;
  const admin = getSupabaseAdminClient();
  if (!admin || !canEncrypt()) return { ok: false, message: "SUPABASE_SECRET_KEY n'est pas définie sur le serveur." };
  const parsed = newApiSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Données invalides." };

  const { label, provider, baseUrl, model, apiKey } = parsed.data;
  if (provider === "openai-compatible" && !baseUrl) return { ok: false, message: "Indiquez l'adresse de l'API." };

  const row = {
    label,
    provider,
    base_url: baseUrl.replace(/\/+$/, "") || null,
    model,
    api_key_encrypted: encryptSecret(apiKey),
  };

  // Clé refusée ou adresse fausse : rien n'est enregistré.
  const slot = storedSlot({ id: "new", ...row }, 0);
  if (!slot.result.ok) return { ok: false, message: slot.result.reason };
  const check = await checkKey(slot.result.config);
  if (!check.ok && check.code === "auth") {
    return { ok: false, message: `Le fournisseur refuse cette clé : ${check.message}` };
  }

  const { data: last } = await admin.from("ai_providers").select("position").order("position", { ascending: false }).limit(1);
  const { error } = await admin
    .from("ai_providers")
    .insert({ ...row, position: (last?.[0]?.position ?? 0) + 1, created_by: auth.user.id });
  if (error) {
    console.error("[admin] Ajout de l'API impossible", error);
    return { ok: false, message: "L'enregistrement a échoué (migration 20261031000000_ai_providers.sql appliquée ?)." };
  }

  invalidateAIChain();
  revalidatePath("/admin/modele-ia");
  return {
    ok: true,
    message: check.ok ? `${label} ajoutée et connectée.` : `${label} ajoutée (vérification impossible pour l'instant).`,
  };
}

/** Supprime une API ajoutée depuis l'admin ; celles des variables du serveur ne se suppriment pas ici. */
export async function deleteApiAction(slotId: unknown): Promise<ActionResult> {
  if (!(await requireAdminAction())) return NOT_ADMIN;
  const admin = getSupabaseAdminClient();
  if (!admin) return { ok: false, message: "SUPABASE_SECRET_KEY n'est pas définie sur le serveur." };
  const id = typeof slotId === "string" && slotId.startsWith("db-") ? slotId.slice(3) : null;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) {
    return { ok: false, message: "Cette API est déclarée dans les variables du serveur : retirez-la de .env.local." };
  }

  const { error } = await admin.from("ai_providers").delete().eq("id", parsed.data);
  if (error) {
    console.error("[admin] Suppression de l'API impossible", error);
    return { ok: false, message: "La suppression a échoué." };
  }
  invalidateAIChain();
  revalidatePath("/admin/modele-ia");
  return { ok: true, message: "API supprimée." };
}

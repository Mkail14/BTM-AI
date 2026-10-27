import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { providerLabel, readAIChain, readAIConfig, type AIProviderName, type AISlot } from "./config";
import { decryptSecret } from "./secret-box";

export type StoredProvider = {
  id: string;
  label: string;
  provider: AIProviderName;
  base_url: string | null;
  model: string;
  api_key_encrypted: string;
};

/**
 * Transforme une API enregistrée en base en emplacement de la chaîne. Les
 * réglages communs (plafond de tokens, délai, effort…) sont ceux de l'API
 * principale ; fournisseur, adresse, modèle et clé sont propres à la ligne.
 */
export function storedSlot(row: StoredProvider, slot: number, env: Record<string, string | undefined> = process.env): AISlot {
  const apiKey = decryptSecret(row.api_key_encrypted, env);
  const base = { id: `db-${row.id}`, source: "db" as const, slot, prefix: "", label: row.label };
  if (!apiKey) {
    return { ...base, result: { ok: false, reason: "Clé illisible (clé de chiffrement changée) : supprimez puis rajoutez cette API." } };
  }
  const result = readAIConfig(
    {
      ...env,
      AI_DB_PROVIDER: row.provider,
      AI_DB_API_KEY: apiKey,
      AI_DB_MODEL: row.model,
      AI_DB_BASE_URL: row.base_url ?? undefined,
    },
    "AI_DB_",
  );
  return { ...base, label: row.label || (result.ok ? providerLabel(result.config) : `API ${slot}`), result };
}

const CACHE_MS = 60_000;
let cache: { rows: StoredProvider[]; expiresAt: number } | null = null;

async function loadStoredProviders(): Promise<StoredProvider[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.rows;
  const admin = getSupabaseAdminClient();
  let rows: StoredProvider[] = [];
  if (admin) {
    const { data, error } = await admin
      .from("ai_providers")
      .select("id, label, provider, base_url, model, api_key_encrypted")
      .order("position")
      .order("created_at");
    if (error) console.error("[ai] API enregistrées illisibles (migration ai_providers appliquée ?)", error);
    else rows = (data ?? []) as StoredProvider[];
  }
  cache = { rows, expiresAt: Date.now() + CACHE_MS };
  return rows;
}

/** Après un ajout ou une suppression depuis /admin (les autres instances suivent sous 60 s). */
export function invalidateAIChain() {
  cache = null;
}

/** Chaîne complète : API des variables du serveur, puis celles ajoutées depuis l'admin. */
export async function loadAIChain(): Promise<AISlot[]> {
  const envSlots = readAIChain();
  // Sans API principale dans les variables (AI_API_KEY vide), une API ajoutée depuis l'admin suffit.
  const primary = envSlots[0];
  const stored = await loadStoredProviders();
  const keepPrimary = primary.result.ok || stored.length === 0;
  const fromEnv = keepPrimary ? envSlots : envSlots.slice(1);
  return [...fromEnv, ...stored.map((row, index) => storedSlot(row, fromEnv.length + index + 1))].map((s, index) => ({
    ...s,
    slot: index + 1,
  }));
}

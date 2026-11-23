import "server-only";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { providerLabel, readAIChain, readAIConfig, type AIProviderName, type AISlot } from "@/lib/ai/config";
import { decryptSecret } from "@/lib/ai/secret-box";

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
type Stored = { rows: StoredProvider[]; removed: Set<string>; order: string[] };
let cache: (Stored & { expiresAt: number }) | null = null;

const isEnvSlotId = (id: unknown): id is string => typeof id === "string" && /^env-\d+$/.test(id);
/** Identifiant d'une API de la chaîne : « env-n » (variables du serveur) ou « db-<uuid> » (ajoutée depuis l'admin). */
export const isSlotId = (id: unknown): id is string =>
  typeof id === "string" && (isEnvSlotId(id) || /^db-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));

/**
 * Range les API selon l'ordre choisi depuis /admin/circuit. Celles qui n'y sont
 * pas (ajoutées depuis) gardent leur ordre habituel, après les autres.
 */
export function sortByChosenOrder<T extends { id: string }>(slots: readonly T[], order: readonly string[]): T[] {
  const rank = (id: string, index: number) => {
    const chosen = order.indexOf(id);
    return chosen === -1 ? order.length + index : chosen;
  };
  return slots
    .map((slot, index) => ({ slot, rank: rank(slot.id, index) }))
    .sort((a, b) => a.rank - b.rank)
    .map((s) => s.slot);
}

async function loadStored(): Promise<Stored> {
  if (cache && cache.expiresAt > Date.now()) return cache;
  const admin = getSupabaseAdminClient();
  let rows: StoredProvider[] = [];
  let removed = new Set<string>();
  let order: string[] = [];
  if (admin) {
    const [providers, settings, chosen] = await Promise.all([
      admin
        .from("ai_providers")
        .select("id, label, provider, base_url, model, api_key_encrypted")
        .order("position")
        .order("created_at"),
      admin.from("awa_settings").select("removed_apis").eq("id", 1).maybeSingle(),
      // Lu à part : sans la migration api_order, le reste de la chaîne se lit quand même.
      admin.from("awa_settings").select("api_order").eq("id", 1).maybeSingle(),
    ]);
    const chosenOrder: unknown = chosen.error ? [] : chosen.data?.api_order;
    order = Array.isArray(chosenOrder) ? chosenOrder.filter(isSlotId) : [];
    if (providers.error) console.error("[ai] API enregistrées illisibles (migration ai_providers appliquée ?)", providers.error);
    else rows = (providers.data ?? []) as StoredProvider[];
    // Colonne absente (migration removed_apis non appliquée) : aucune API retirée.
    const list: unknown = settings.error ? [] : settings.data?.removed_apis;
    removed = new Set(Array.isArray(list) ? list.filter(isEnvSlotId) : []);
  }
  cache = { rows, removed, order, expiresAt: Date.now() + CACHE_MS };
  return cache;
}

/** API du serveur retirées depuis /admin/circuit (identifiants « env-n »). */
export async function loadRemovedApis(): Promise<Set<string>> {
  return (await loadStored()).removed;
}

/** Après un ajout ou une suppression depuis /admin (les autres instances suivent sous 60 s). */
export function invalidateAIChain() {
  cache = null;
}

/**
 * Chaîne complète : API des variables du serveur (sauf celles retirées depuis
 * l'admin), puis celles ajoutées depuis l'admin, rangées ensuite selon l'ordre
 * choisi sur /admin/circuit. La première est l'API principale, les suivantes ses secours.
 */
export async function loadAIChain(): Promise<AISlot[]> {
  const { rows: stored, removed, order } = await loadStored();
  const envSlots = readAIChain().filter((s) => !removed.has(s.id));
  // Sans API principale dans les variables (AI_API_KEY vide), une API ajoutée depuis l'admin suffit.
  const primary = envSlots[0];
  const keepPrimary = !primary || primary.id !== "env-1" || primary.result.ok || stored.length === 0;
  const fromEnv = keepPrimary ? envSlots : envSlots.slice(1);
  const chain = [...fromEnv, ...stored.map((row, index) => storedSlot(row, fromEnv.length + index + 1))];
  return sortByChosenOrder(chain, order).map((s, index) => ({
    ...s,
    slot: index + 1,
  }));
}

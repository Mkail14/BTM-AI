import "server-only";
import { after } from "next/server";
import { getSupabaseAdminClient } from "@/server/config/supabase-admin";
import { loadFlowCuts } from "@/server/services/ai/flow-cuts";
import { loadAIChain } from "@/server/services/ai/registry";
import type { AIProviderError } from "@/lib/ai/types";

/**
 * État réel de chaque API du circuit, pour le tableau de bord, sans aucune demande en plus :
 * c'est ce que les vrais messages de Tamilya ont obtenu (la chaîne essaie les API une à une).
 * Aucun solde deviné : Google ne donne pas le crédit restant, seulement « ça marche » ou
 * « crédit épuisé ». Gardé dans le stockage Supabase (dossier privé « circuit », un fichier
 * par API) : pas de migration. Une API ajoutée ou retirée apparaît ou disparaît toute seule.
 */

export type ApiState = "ok" | "empty" | "limit" | "refused" | "missing" | "down" | "cut" | "broken" | "unseen";

export const API_STATE_LABELS: Record<ApiState, string> = {
  ok: "Marche",
  empty: "Crédit épuisé",
  limit: "Limite atteinte",
  refused: "Clé refusée",
  missing: "Modèle refusé",
  down: "Ne répond pas",
  cut: "Débranchée",
  broken: "Mal réglée",
  unseen: "Pas encore utilisée",
};

export type ApiStatus = { id: string; name: string; state: ApiState; seenAt?: number };

const BUCKET = "circuit";
const fileOf = (slotId: string) => `api/${slotId.replace(/[^\w-]/g, "_")}.json`;
/**
 * Même état : réécrit au plus toutes les 5 minutes (pour « vu il y a… »), sinon tout de suite.
 * Un échec est réécrit plus souvent : sa date fixe la pause que voient les autres serveurs.
 */
const REWRITE_MS = 5 * 60_000;
const FAILURE_REWRITE_MS = 20_000;
const written = new Map<string, { state: ApiState; at: number }>();

/** Dernier résultat connu de chaque API, tous serveurs confondus (lu par l'aiguillage, switch.ts). */
const shared = new Map<string, { state: ApiState; at: number }>();
/** Relecture du stockage au plus toutes les 15 s ; le premier message d'un serveur attend au plus 300 ms. */
const SHARED_TTL_MS = 15_000;
const FIRST_READ_WAIT_MS = 300;
let sharedReadAt = 0;
let sharedReading: Promise<void> | null = null;

function stateOf(error: AIProviderError | null): ApiState {
  if (!error) return "ok";
  switch (error.code) {
    case "quota":
      // 402 ou « prepayment credits » : plus de crédit ; 429 « quota » : limite (souvent gratuite) atteinte.
      return /402|crédit|credit|prepay/i.test(error.message) ? "empty" : "limit";
    case "rate_limited":
      return "limit";
    case "auth":
      return "refused";
    case "bad_request":
      return "missing";
    default:
      return "down";
  }
}

let bucketReady: Promise<void> | null = null;
function ensureBucket(admin: NonNullable<ReturnType<typeof getSupabaseAdminClient>>) {
  bucketReady ??= (async () => {
    const { data } = await admin.storage.getBucket(BUCKET);
    if (data) return;
    const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 100_000, allowedMimeTypes: ["application/json"] });
    if (error && !/exist/i.test(error.message)) throw new Error(error.message);
  })().catch((error: unknown) => {
    bucketReady = null;
    throw error;
  });
  return bucketReady;
}

/** Résultat d'une API pour un vrai message (appelé par la chaîne), enregistré après la réponse. */
export function recordApiResult(slotId: string, error: AIProviderError | null): void {
  const admin = getSupabaseAdminClient();
  if (!admin) return;
  const state = stateOf(error);
  const now = Date.now();
  const last = written.get(slotId);
  const known = shared.get(slotId);
  shared.set(slotId, { state, at: now });
  const gap = state === "ok" ? REWRITE_MS : FAILURE_REWRITE_MS;
  // Un autre serveur a vu autre chose depuis : on réécrit tout de suite.
  if (last && last.state === state && known?.state === state && now - last.at < gap) return;
  written.set(slotId, { state, at: now });
  const task = async () => {
    try {
      await ensureBucket(admin);
      const body = new Blob([JSON.stringify({ state, at: now })], { type: "application/json" });
      const { error: uploadError } = await admin.storage.from(BUCKET).upload(fileOf(slotId), body, { upsert: true, contentType: "application/json", cacheControl: "0" });
      if (uploadError) throw new Error(uploadError.message);
    } catch (failure) {
      written.delete(slotId);
      console.error("[ai] État de l'API non enregistré", failure instanceof Error ? failure.message : failure);
    }
  };
  try {
    after(task);
  } catch {
    // Hors requête (tests, tâches de fond) : enregistrement sans attente.
    void task();
  }
}

async function readSeen(slotId: string): Promise<{ state: ApiState; at: number } | null> {
  const admin = getSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.storage.from(BUCKET).download(fileOf(slotId));
  if (error || !data) return null;
  try {
    const value = JSON.parse(await data.text()) as { state?: unknown; at?: unknown };
    return typeof value.state === "string" && value.state in API_STATE_LABELS && typeof value.at === "number"
      ? { state: value.state as ApiState, at: value.at }
      : null;
  } catch {
    return null;
  }
}

/** Dernier résultat partagé d'une API (sans attente : lu depuis la mémoire du serveur). */
export function getSharedState(slotId: string): { state: ApiState; at: number } | undefined {
  return shared.get(slotId);
}

/**
 * Relit l'état partagé des API. Déjà frais : rien. Sinon relecture en fond ;
 * seul le tout premier appel d'un serveur attend, et au plus 300 ms.
 */
export async function refreshSharedStates(slotIds: readonly string[]): Promise<void> {
  if (!getSupabaseAdminClient() || slotIds.length === 0) return;
  const first = sharedReadAt === 0;
  if (!first && Date.now() - sharedReadAt < SHARED_TTL_MS) return;
  sharedReading ??= (async () => {
    const seen = await Promise.all(slotIds.map((id) => readSeen(id).catch(() => null)));
    seen.forEach((value, index) => {
      const id = slotIds[index];
      // Ce que ce serveur a vu après la dernière écriture garde la main.
      if (value && (shared.get(id)?.at ?? 0) < value.at) shared.set(id, value);
    });
    sharedReadAt = Date.now();
  })().finally(() => {
    sharedReading = null;
  });
  if (first) await Promise.race([sharedReading, new Promise((resolve) => setTimeout(resolve, FIRST_READ_WAIT_MS))]);
}

/** Toutes les API du circuit, dans l'ordre, avec ce que les derniers messages en ont vu. */
export async function getApiStatuses(): Promise<ApiStatus[]> {
  const [chain, cuts] = await Promise.all([loadAIChain(), loadFlowCuts()]);
  return Promise.all(
    chain.map(async (slot): Promise<ApiStatus> => {
      if (!slot.result.ok) return { id: slot.id, name: slot.label, state: "broken" };
      const name = `${slot.label} · ${slot.result.config.model}`;
      if (cuts.has(slot.id)) return { id: slot.id, name, state: "cut" };
      const seen = await readSeen(slot.id).catch(() => null);
      return seen ? { id: slot.id, name, state: seen.state, seenAt: seen.at } : { id: slot.id, name, state: "unseen" };
    }),
  );
}

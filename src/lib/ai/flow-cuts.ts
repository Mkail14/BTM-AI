import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Liens coupés depuis le schéma de /admin/circuit (comme dans n8n). Un fil
 * coupé arrête les messages : Tamilya ne répond plus tant qu'il n'est pas
 * rebranché. Seules les API, qui se relaient, peuvent être coupées une à une :
 * le message passe tant qu'il en reste une branchée.
 */
export const BRAIN_BLOCKS = ["personality", "settings", "knowledge", "lexicon", "memory"] as const;
/** Blocs dont la coupure arrête tous les messages, dans l'ordre du trajet. */
export const STOP_BLOCKS = ["input", ...BRAIN_BLOCKS] as const;
export type StopBlock = (typeof STOP_BLOCKS)[number];

/** Raison renvoyée par getAIProvider quand toutes les API sont coupées. */
export const ALL_APIS_CUT = "Toutes les API sont débranchées.";

/** « input » (lien Message reçu → Quotas), bloc du cerveau ou API de la chaîne (« env-2 », « db-<uuid> »). */
export function isCuttableBlock(id: unknown): id is string {
  return (
    typeof id === "string" &&
    ((STOP_BLOCKS as readonly string[]).includes(id) || /^env-\d+$/.test(id) || /^db-[0-9a-f-]{36}$/i.test(id))
  );
}

/** Premier bloc coupé sur le trajet du message (le message s'y arrête), ou null. */
export function flowCutStop(cuts: Set<string>): StopBlock | null {
  return STOP_BLOCKS.find((block) => cuts.has(block)) ?? null;
}

/**
 * Liens coupés (base, sinon aucun). Relus à chaque message, sans cache : un
 * cache en mémoire n'est vidé que dans le module qui enregistre la coupure,
 * pas dans les routes du chat ni sur les autres instances, et un fil coupé
 * doit arrêter le message suivant.
 */
export async function loadFlowCuts(): Promise<Set<string>> {
  const admin = getSupabaseAdminClient();
  if (!admin) return new Set();
  const { data, error } = await admin.from("awa_settings").select("flow_cuts").eq("id", 1).maybeSingle();
  if (error) {
    console.error("[ai] Liens coupés illisibles (migration flow_cuts appliquée ?)", error);
    return new Set();
  }
  return new Set(Array.isArray(data?.flow_cuts) ? data.flow_cuts.filter(isCuttableBlock) : []);
}

/**
 * Liens coupés pour un message du chat : gardés 15 s en mémoire, au lieu d'une
 * lecture de la base à chaque message. Un fil coupé depuis /admin/circuit
 * arrête donc les messages au plus 15 s après. La page /admin/circuit, elle,
 * relit toujours la base (loadFlowCuts) et montre l'état exact.
 */
const MESSAGE_CACHE_MS = 15_000;
let messageCache: { cuts: Promise<Set<string>>; expiresAt: number } | null = null;

export function loadFlowCutsForMessage(): Promise<Set<string>> {
  if (messageCache && messageCache.expiresAt > Date.now()) return messageCache.cuts;
  const cuts = loadFlowCuts();
  messageCache = { cuts, expiresAt: Date.now() + MESSAGE_CACHE_MS };
  // Une lecture en échec n'est pas gardée.
  cuts.catch(() => {
    if (messageCache?.cuts === cuts) messageCache = null;
  });
  return cuts;
}

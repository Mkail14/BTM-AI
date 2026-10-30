import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Liens coupés depuis le schéma de /admin/modele-ia (comme dans n8n). Un fil
 * coupé arrête les messages : Awa ne répond plus tant qu'il n'est pas
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

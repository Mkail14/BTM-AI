import "server-only";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { FEATURES, featuresFor, readSwitches, type FeatureId, type FeatureSwitches } from "./features-rules";

/**
 * Fonctionnalités allumées pour tous (table site_settings, colonne features), lues avec la clé
 * secrète. Gardées en mémoire 30 s, comme le bandeau : relues tout de suite après un changement
 * sur ce serveur. Illisibles (migration absente) : les valeurs par défaut.
 */
const TTL_MS = 30_000;
let cached: { value: FeatureSwitches; at: number } | null = null;

const DEFAULTS = readSwitches({});

/** null avec fresh : illisible (migration 20261210000000 absente ?), pour l'avertir dans l'administration. */
export async function getFeatureSwitches({ fresh = false }: { fresh?: boolean } = {}): Promise<FeatureSwitches | null> {
  if (!fresh && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const admin = getSupabaseAdminClient();
  if (!admin) return DEFAULTS;
  const { data, error } = await admin.from("site_settings").select("features").eq("id", 1).maybeSingle();
  if (error) {
    console.error("[site] Fonctionnalités illisibles", error.message);
    return fresh ? null : (cached?.value ?? DEFAULTS);
  }
  const value = readSwitches(data?.features);
  cached = { value, at: Date.now() };
  return value;
}

/** Les fonctionnalités de cette personne (toutes pour un administrateur). */
export async function userFeatures(user: { isAdmin?: boolean } | null): Promise<FeatureId[]> {
  return featuresFor(user, (await getFeatureSwitches()) ?? DEFAULTS);
}

/** Vérification côté serveur, à chaque demande. */
export async function canUse(user: { isAdmin?: boolean } | null, feature: FeatureId): Promise<boolean> {
  return (await userFeatures(user)).includes(feature);
}

export async function saveFeatureSwitch(feature: FeatureId, enabled: boolean, userId: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  if (!admin) return false;
  const current = await getFeatureSwitches({ fresh: true });
  if (!current) return false;
  const features = { ...current, [feature]: enabled };
  const { data, error } = await admin
    .from("site_settings")
    .update({ features, updated_at: new Date().toISOString(), updated_by: userId })
    .eq("id", 1)
    .select("id");
  if (error || !data?.length) {
    console.error("[site] Fonctionnalité non enregistrée", error?.message);
    return false;
  }
  cached = null;
  return true;
}

export { FEATURES };

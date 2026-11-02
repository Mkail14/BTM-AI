import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/config";

/**
 * Maintenance et mode démo (table site_settings), lus avec la clé secrète.
 * Sans « server-only » : le proxy les lit aussi à chaque page. Ne jamais
 * importer depuis un composant client.
 */

export type SiteFlags = { maintenance: boolean; maintenanceMessage: string; demoMode: boolean };

const OFF: SiteFlags = { maintenance: false, maintenanceMessage: "", demoMode: false };

/** Gardés quelques secondes en mémoire : un changement s'applique partout en moins de 10 s. */
const FLAGS_TTL_MS = 10_000;
let cached: { flags: SiteFlags; at: number } | null = null;
let client: SupabaseClient | null = null;

export async function getSiteFlags(): Promise<SiteFlags> {
  if (cached && Date.now() - cached.at < FLAGS_TTL_MS) return cached.flags;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!isSupabaseConfigured || !secretKey) return OFF;
  client ??= createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client
    .from("site_settings")
    .select("maintenance, maintenance_message, demo_mode")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    // Table absente (migration non appliquée) ou base injoignable : le site reste ouvert.
    console.error("[site] Réglages illisibles", error.message);
    return cached?.flags ?? OFF;
  }
  const flags: SiteFlags = {
    maintenance: Boolean(data?.maintenance),
    maintenanceMessage: data?.maintenance_message ?? "",
    demoMode: Boolean(data?.demo_mode),
  };
  cached = { flags, at: Date.now() };
  return flags;
}

/** Après un changement : relu tout de suite par ce serveur. */
export function forgetSiteFlags() {
  cached = null;
}

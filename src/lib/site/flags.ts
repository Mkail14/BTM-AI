import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseUrl } from "@/lib/supabase/config";
import type { SiteStatus } from "./status";

/**
 * État du site et mode démo (table site_settings), lus avec la clé secrète.
 * Sans « server-only » : le proxy les lit aussi à chaque page. Ne jamais
 * importer depuis un composant client.
 */

export type SiteFlags = { status: SiteStatus; maintenanceMessage: string; demoMode: boolean };

const OFF: SiteFlags = { status: "online", maintenanceMessage: "", demoMode: false };

/** Gardés en mémoire : un changement s'applique partout en moins de 30 s (tout de suite sur ce serveur). */
const FLAGS_TTL_MS = 30_000;
let cached: { flags: SiteFlags; at: number } | null = null;
let client: SupabaseClient | null = null;

/** fresh : relu en base (page des réglages, pour ne jamais montrer un état périmé). */
export async function getSiteFlags({ fresh = false }: { fresh?: boolean } = {}): Promise<SiteFlags> {
  if (!fresh && cached && Date.now() - cached.at < FLAGS_TTL_MS) return cached.flags;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!isSupabaseConfigured || !secretKey) return OFF;
  client ??= createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client
    .from("site_settings")
    .select("status, maintenance_message, demo_mode")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    // Table absente (migration non appliquée) ou base injoignable : le site reste ouvert.
    console.error("[site] Réglages illisibles", error.message);
    return cached?.flags ?? OFF;
  }
  const flags: SiteFlags = {
    status: (data?.status as SiteStatus | undefined) ?? "online",
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

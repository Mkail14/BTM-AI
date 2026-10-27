import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseUrl } from "./config";

let adminClient: SupabaseClient | null = null;

/**
 * Client avec la clé secrète (service role). Il contourne RLS : il n'est utilisé
 * que pour la limitation de débit et les statistiques de la page d'administration
 * (comptages et liste des comptes), jamais pour lire ou écrire des conversations.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!isSupabaseConfigured || !secretKey) return null;

  adminClient ??= createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseUrl } from "./config";

let adminClient: SupabaseClient | null = null;

/**
 * Client avec la clé secrète (service role). Il contourne RLS : limitation de
 * débit, administration, et les écritures que seul le serveur doit faire après
 * ses vérifications (messages, souvenirs, demandes du code), toujours avec le
 * compte tiré de la session. Jamais pour lire les conversations des comptes.
 */
export function getSupabaseAdminClient(): SupabaseClient | null {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!isSupabaseConfigured || !secretKey) return null;

  adminClient ??= createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

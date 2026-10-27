import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "./config";

/** Client Supabase côté navigateur (null si Supabase n'est pas configuré). */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  // createBrowserClient renvoie déjà une instance unique dans le navigateur.
  return createBrowserClient(supabaseUrl, supabasePublishableKey);
}

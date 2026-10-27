import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "./config";

/**
 * Client Supabase lié aux cookies de la requête courante. Toutes les requêtes
 * passent avec l'identité de l'utilisateur : les politiques RLS s'appliquent.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  // Lu avant le test de configuration : les pages qui dépendent de la session
  // restent rendues à la demande, même si le build a lieu sans Supabase.
  const cookieStore = await cookies();
  if (!isSupabaseConfigured) return null;

  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Appelé depuis un Server Component : les cookies ne peuvent pas être
          // écrits ici. Le proxy se charge du rafraîchissement de la session.
        }
      },
    },
  });
}

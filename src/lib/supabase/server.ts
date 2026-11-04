import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { selectClient } from "@/lib/auth/identity";
import { chooseAuthSource, createBearerClient } from "./bearer";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "./config";

/**
 * Client Supabase lié à la requête courante. Toutes les requêtes passent avec
 * l'identité de l'utilisateur : les politiques RLS s'appliquent.
 *
 * Deux sources d'identité, par ordre de priorité :
 * 1. le cookie de session Supabase (site web) : comportement historique, et
 *    l'en-tête Authorization est alors ignoré, sauf si le cookie ne donne aucune
 *    session ET qu'un Bearer est présent (le Bearer prend alors le relais) ;
 * 2. à défaut, `Authorization: Bearer <jwt>` (application mobile) : client sans
 *    cookies qui agit avec ce jeton. Il est validé par getSessionUser() ; un
 *    Bearer invalide n'est jamais traité comme un invité (voir getAuthContext).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient | null> {
  // Lu avant le test de configuration : les pages qui dépendent de la session
  // restent rendues à la demande, même si le build a lieu sans Supabase.
  const cookieStore = await cookies();
  if (!isSupabaseConfigured) return null;

  const source = chooseAuthSource(
    cookieStore.getAll().map((c) => c.name),
    (await headers()).get("authorization"),
  );
  return selectClient(source, () => createCookieClient(cookieStore), createBearerClient);
}

function createCookieClient(cookieStore: Awaited<ReturnType<typeof cookies>>): SupabaseClient {
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

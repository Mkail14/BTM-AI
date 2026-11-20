import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import { isPersonalityId, type PersonalityId } from "@/lib/ai/personalities";

/** Requêtes de la table profiles. RLS : un compte ne lit et ne modifie que son profil. */

/** Mémorisé le temps d'un rendu : la mise en page et la page partagent la même lecture. */
export const getProfile = cache(async (supabase: SupabaseClient, userId: string) => {
  // « * » plutôt qu'une liste : la page reste fonctionnelle si la migration
  // de la colonne personality n'est pas encore appliquée.
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  // undefined : colonne absente (migration non appliquée), le choix n'est pas proposé.
  const personality: PersonalityId | null | undefined =
    data && "personality" in data ? (isPersonalityId(data.personality) ? data.personality : null) : undefined;
  return { displayName: (data?.display_name as string | null) ?? null, personality };
});

export async function updatePersonality(
  supabase: SupabaseClient,
  userId: string,
  personality: PersonalityId,
) {
  const { error } = await supabase
    .from("profiles")
    .update({ personality })
    .eq("id", userId);
  if (error) throw error;
}

export async function updateProfile(
  supabase: SupabaseClient,
  userId: string,
  displayName: string | null,
) {
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: displayName })
    .eq("id", userId);
  if (error) throw error;
}

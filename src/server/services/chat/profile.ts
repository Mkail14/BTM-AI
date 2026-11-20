import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { nearestOfficesLine } from "@/lib/code-exam/offices";
import { isPersonalityId, type PersonalityId } from "@/lib/ai/personalities";

/** Commune du compte et bureaux du code les plus proches (« près de chez moi »). */
export type ChatHome = { commune: string; nearestOffices: string | null };

/**
 * Profil du compte pour un message, en UNE lecture de la table profiles :
 * personnalité choisie (comme getProfile) et adresse (comme getProfileContact).
 * « * » : rien ne casse si une migration de colonne n'est pas encore appliquée.
 * personality undefined : colonne absente ou profil illisible (valeur par défaut).
 */
export async function readChatProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ personality: PersonalityId | null | undefined; home: ChatHome | null }> {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) {
    console.error("[chat] Profil indisponible, valeurs par défaut", error);
    return { personality: undefined, home: null };
  }
  const personality: PersonalityId | null | undefined =
    data && "personality" in data ? (isPersonalityId(data.personality) ? data.personality : null) : undefined;
  let home: ChatHome | null = null;
  if (data && typeof data.address_commune === "string" && typeof data.address_line === "string") {
    const geo =
      typeof data.address_lat === "number" && typeof data.address_lng === "number"
        ? { lat: data.address_lat, lng: data.address_lng, accuracy: Number(data.address_accuracy ?? 0) }
        : null;
    home = { commune: data.address_commune, nearestOffices: nearestOfficesLine(data.address_commune, geo) };
  }
  return { personality, home };
}

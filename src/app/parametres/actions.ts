"use server";

import { revalidatePath } from "next/cache";
import { isPersonalityId } from "@/lib/ai/personalities";
import { getAuthContext } from "@/lib/auth/session";
import { profileSchema } from "@/lib/chat/validation";
import { updatePersonality, updateProfile } from "@/lib/conversations/repository";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { DELETE_CONFIRMATION } from "./confirmation";

export type ProfileFormState = { status: "idle" | "saved" | "error"; message?: string };

export async function updateProfileAction(
  _previous: ProfileFormState,
  formData: FormData,
): Promise<ProfileFormState> {
  // L'action s'autorise elle-même : on relit la session, sans se fier au formulaire.
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };

  const parsed = profileSchema.safeParse({ displayName: formData.get("displayName") ?? "" });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Valeur invalide." };
  }

  try {
    await updateProfile(supabase, user.id, parsed.data.displayName || null);
  } catch (error) {
    console.error("[parametres] Mise à jour du profil impossible", error);
    return { status: "error", message: "L'enregistrement a échoué. Réessayez." };
  }

  revalidatePath("/", "layout");
  return { status: "saved", message: "Paramètres enregistrés." };
}

/** Choix de la personnalité d'Awa (après l'inscription ou depuis les Paramètres). */
export async function choosePersonalityAction(personality: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };
  if (!isPersonalityId(personality)) return { status: "error", message: "Personnalité inconnue." };

  try {
    await updatePersonality(supabase, user.id, personality);
  } catch (error) {
    console.error("[parametres] Choix de personnalité impossible", error);
    return { status: "error", message: "L'enregistrement a échoué. Réessayez." };
  }

  revalidatePath("/", "layout");
  return { status: "saved", message: "C'est noté, Awa change de caractère !" };
}

/**
 * Suppression définitive du compte : l'utilisateur d'auth est effacé, et avec
 * lui (on delete cascade) son profil, ses conversations et ses messages.
 * Le compte administrateur protégé est refusé par la base elle-même.
 */
export async function deleteAccountAction(confirmation: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };
  if (confirmation !== DELETE_CONFIRMATION) {
    return { status: "error", message: `Écrivez ${DELETE_CONFIRMATION} pour confirmer.` };
  }

  const admin = getSupabaseAdminClient();
  if (!admin) return { status: "error", message: "La suppression est indisponible pour le moment." };

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    // Le refus du déclencheur arrive en « Database error » générique : un admin refusé est le compte protégé.
    if (user.isAdmin || /protégé|protected/i.test(error.message)) {
      return { status: "error", message: "Ce compte administrateur est protégé : il ne peut pas être supprimé." };
    }
    console.error("[parametres] Suppression du compte impossible", error);
    return { status: "error", message: "La suppression a échoué. Réessayez." };
  }

  // Efface les cookies de session (le jeton ne correspond plus à aucun compte).
  await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  revalidatePath("/", "layout");
  return { status: "saved", message: "Votre compte a été supprimé." };
}

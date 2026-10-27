"use server";

import { revalidatePath } from "next/cache";
import { isPersonalityId } from "@/lib/ai/personalities";
import { getAuthContext } from "@/lib/auth/session";
import { profileSchema } from "@/lib/chat/validation";
import { updatePersonality, updateProfile } from "@/lib/conversations/repository";

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

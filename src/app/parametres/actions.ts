"use server";

import { revalidatePath } from "next/cache";
import { isPersonalityId } from "@/lib/ai/personalities";
import { addressSchema, MAX_SAVED_ADDRESSES, savedAddressSchema } from "@/lib/address";
import { getAuthContext } from "@/lib/auth/session";
import { normalizePhone } from "@/lib/code-exam/candidate";
import { saveProfileAddress, saveProfilePhone } from "@/lib/profile-contact";
import { deleteSavedAddress, saveSavedAddress } from "@/lib/saved-addresses";
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

/** Adresse du compte : livraisons et « près de chez moi » (bureau du code le plus proche…). */
export async function saveAddressAction(input: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Adresse invalide." };
  try {
    await saveProfileAddress(supabase, user.id, parsed.data);
  } catch (error) {
    console.error("[parametres] Adresse non enregistrée", error);
    return { status: "error", message: "L'enregistrement a échoué. Réessayez." };
  }
  revalidatePath("/parametres");
  return { status: "saved", message: "Adresse enregistrée." };
}

/** Téléphone du compte (livreur, rappel pour le code) : jamais renvoyé en entier au navigateur. */
export async function savePhoneAction(input: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };
  const phone = typeof input === "string" ? normalizePhone(input) : null;
  if (!phone) return { status: "error", message: "Numéro invalide : 10 chiffres, par exemple 0639 12 34 56." };
  try {
    await saveProfilePhone(supabase, user.id, phone);
  } catch (error) {
    console.error("[parametres] Téléphone non enregistré", error);
    return { status: "error", message: "L'enregistrement a échoué. Réessayez." };
  }
  revalidatePath("/parametres");
  return { status: "saved", message: "Numéro enregistré." };
}

/** Fait oublier à Awa un souvenir (kind), ou tous si kind est absent. */
export async function forgetMemoryAction(kind?: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };
  let query = supabase.from("awa_memories").delete().eq("user_id", user.id);
  if (kind !== undefined) {
    if (typeof kind !== "string" || kind.length > 60) return { status: "error", message: "Souvenir inconnu." };
    query = query.eq("kind", kind);
  }
  const { error } = await query;
  if (error) {
    console.error("[parametres] Souvenir non effacé", error);
    return { status: "error", message: "L'effacement a échoué. Réessayez." };
  }
  revalidatePath("/parametres");
  return { status: "saved", message: kind === undefined ? "Awa a tout oublié." : "Souvenir effacé." };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ajoute (id absent) ou modifie une adresse du carnet : travail, ami, famille… */
export async function saveSavedAddressAction(input: unknown, id?: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };
  if (id !== undefined && (typeof id !== "string" || !UUID.test(id))) return { status: "error", message: "Adresse inconnue." };
  const parsed = savedAddressSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Adresse invalide." };
  try {
    await saveSavedAddress(supabase, parsed.data, id);
  } catch (error) {
    const full = error instanceof Error && /Carnet plein/.test(error.message);
    if (!full) console.error("[parametres] Adresse du carnet non enregistrée", error);
    return { status: "error", message: full ? `Carnet plein : ${MAX_SAVED_ADDRESSES} adresses au maximum.` : "L'enregistrement a échoué. Réessayez." };
  }
  revalidatePath("/parametres");
  return { status: "saved", message: id ? "Adresse modifiée." : "Adresse ajoutée." };
}

export async function deleteSavedAddressAction(id: unknown): Promise<ProfileFormState> {
  const { supabase, user } = await getAuthContext();
  if (!supabase || !user) return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };
  if (typeof id !== "string" || !UUID.test(id)) return { status: "error", message: "Adresse inconnue." };
  try {
    await deleteSavedAddress(supabase, id);
  } catch (error) {
    console.error("[parametres] Adresse du carnet non supprimée", error);
    return { status: "error", message: "La suppression a échoué. Réessayez." };
  }
  revalidatePath("/parametres");
  return { status: "saved", message: "Adresse supprimée." };
}
